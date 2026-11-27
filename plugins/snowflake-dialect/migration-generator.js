// 日本語コメント: Snowflake マイグレーション SQL 生成器 (plugins/snowflake-dialect/migration-generator.js)

function formatSqlDefault(val, dataType) {
  if (val === undefined || val === null) return '';
  const raw = (typeof val === 'object' && val !== null && 'value' in val) ? val.value : val;
  if (raw === undefined || raw === null || String(raw).trim() === '') return '';
  const strVal = String(raw).trim();
  if (strVal.startsWith("'") && strVal.endsWith("'")) return strVal;

  const typeStr = typeof dataType === 'string' ? dataType : (dataType ? (dataType.type_name || '') : '');
  if (/^(VARCHAR|STRING|TEXT|CHAR)/i.test(typeStr.trim())) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  const lower = strVal.toLowerCase();
  if (['true', 'false', 'null'].includes(lower)) return lower.toUpperCase();
  if (/^(current_timestamp|current_date|uuid_string\(\))/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
    return strVal;
  }
  if (!isNaN(Number(strVal))) return strVal;
  return "'" + strVal.replace(/'/g, "''") + "'";
}

function cleanComment(comment) {
  if (!comment) return '';
  let txt = typeof comment === 'object' && comment !== null ? (comment.value || '') : String(comment);
  if (txt.includes('<!-- custom -->')) txt = txt.split('<!-- custom -->')[0];
  txt = txt.trim();
  return txt ? txt.replace(/'/g, "''") : '';
}

function extractComment(obj, commentSource = 'note') {
  if (!obj) return '';
  const note = cleanComment(obj.note);
  const logical = cleanComment(obj.logicalName || (obj.custom && obj.custom.logicalName));
  if (commentSource === 'logicalName') return logical;
  if (commentSource === 'both') return (logical && note) ? `${logical}: ${note}` : (logical || note || '');
  return note;
}

function buildSnowflakeColumnDef(f, options = {}) {
  const typeStr = f.type || f.dataType || 'VARCHAR(255)';
  const inc = f.increment ? ' AUTOINCREMENT' : '';
  const notNull = f.not_null || f.notNull || f.pk ? ' NOT NULL' : '';
  const rawDefVal = !f.increment ? ((f.dbdefault !== null && f.dbdefault !== undefined && f.dbdefault !== '') ? f.dbdefault : (f.default !== undefined ? f.default : '')) : '';
  const formattedDef = formatSqlDefault(rawDefVal, typeStr);
  const defVal = formattedDef ? ` DEFAULT ${formattedDef}` : '';
  const colComment = options.includeComment !== false ? extractComment(f, options.commentSource || 'note') : '';
  const commentClause = colComment ? ` COMMENT '${colComment}'` : '';
  return `  "${f.name}" ${typeStr}${inc}${defVal}${notNull}${commentClause}`;
}

function extractPrimaryKeyInfo(tbl, fields = [], tableName = '') {
  let pkCols = [];
  let pkName = `PK_${tableName.toUpperCase()}`;
  const pkIndex = tbl.indexes ? tbl.indexes.find(idx => idx.pk || idx.type === 'primary') : null;
  if (pkIndex) {
    pkName = (pkIndex.name || pkName).replace(/["`]/g, '');
    const raw = pkIndex.columns || pkIndex.fields || [];
    pkCols = raw.map(c => (typeof c === 'object' ? (c.value || c.name || '') : String(c)).replace(/["`]/g, '').trim()).filter(Boolean);
  } else {
    pkCols = fields.filter(f => f.pk).map(f => f.name.replace(/["`]/g, '').trim());
  }
  return { pkCols, pkName };
}

function buildSnowflakeTableClauses(tbl, options = {}) {
  const custom = tbl.custom || {};
  const clauses = [];
  if (custom.cluster_by) clauses.push(`CLUSTER BY (${custom.cluster_by})`);
  if (custom.data_retention_time_in_days !== undefined && custom.data_retention_time_in_days !== '') {
    clauses.push(`DATA_RETENTION_TIME_IN_DAYS = ${custom.data_retention_time_in_days}`);
  }
  if (options.includeComment !== false) {
    const tc = extractComment(tbl, options.commentSource || 'note');
    if (tc) clauses.push(`COMMENT = '${tc}'`);
  }
  return clauses.length > 0 ? ('\n' + clauses.join('\n')) : '';
}

export function generateSnowflakeMigrationScripts(diffResult, targetTableNames = [], dialectConfig = {}, options = {}) {
  const result = {};
  if (!diffResult || !Array.isArray(diffResult.tables)) return result;

  const targetSet = new Set(targetTableNames.map(n => n.toUpperCase()));
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

  for (const tableDiff of diffResult.tables) {
    const tableName = (tableDiff.name || '').toUpperCase();
    if (targetTableNames.length > 0 && !targetSet.has(tableName)) continue;

    const tblLower = tableName.toLowerCase();
    const scripts = [];
    const mode = tableDiff.migrationMode || tableDiff.status;

    if (mode === 'CREATE' || mode === 'ADD') {
      const newTbl = tableDiff.newTable || {};
      const fields = newTbl.fields || newTbl.columns || [];
      const colDefs = fields.map(f => buildSnowflakeColumnDef(f, options));
      const { pkCols, pkName } = extractPrimaryKeyInfo(newTbl, fields, tableName);
      if (pkCols.length > 0) {
        colDefs.push(`  CONSTRAINT "${pkName}" PRIMARY KEY (${pkCols.map(c => `"${c}"`).join(', ')})`);
      }
      const clauses = buildSnowflakeTableClauses(newTbl, options);
      scripts.push({
        filename: `01_create_table_${tblLower}.sql`,
        content: `-- 新規テーブル作成: ${tableName}\nCREATE TABLE "${tableName}" (\n${colDefs.join(',\n')}\n)${clauses};\n`,
      });
    } else if (mode === 'RECREATE_TABLE') {
      const oldTbl = tableDiff.oldTable || {};
      const newTbl = tableDiff.newTable || {};
      const oldFields = oldTbl.fields || oldTbl.columns || [];
      const newFields = newTbl.fields || newTbl.columns || [];
      const backupTableName = `${tableName}_OLD_${timestamp}`;
      const stagingTableName = `${tableName}_NEW_${timestamp}`;

      // Step 1: ステージングテーブル作成
      const colDefs = newFields.map(f => buildSnowflakeColumnDef(f, options));
      const { pkCols, pkName } = extractPrimaryKeyInfo(newTbl, newFields, tableName);
      if (pkCols.length > 0) {
        colDefs.push(`  CONSTRAINT "${pkName}" PRIMARY KEY (${pkCols.map(c => `"${c}"`).join(', ')})`);
      }
      const clauses = buildSnowflakeTableClauses(newTbl, options);
      scripts.push({
        filename: `01_create_staging_table_${tblLower}.sql`,
        content: `-- 新定義ステージングテーブル作成: ${stagingTableName}\nCREATE TABLE "${stagingTableName}" (\n${colDefs.join(',\n')}\n)${clauses};\n`,
      });

      // Step 2: データ移行（追加カラム対応）
      const oldColNames = new Set(oldFields.map(f => f.name.toUpperCase()));
      const hasCommonCol = newFields.some(nf => oldColNames.has(nf.name.toUpperCase()));
      if (newFields.length > 0 && hasCommonCol) {
        const insertColsMultiline = newFields.map(nf => `    "${nf.name}"`).join(',\n');
        const selectExprsMultiline = newFields.map(nf => {
          if (oldColNames.has(nf.name.toUpperCase())) return `    "${nf.name}"`;
          const typeStr = nf.type || nf.dataType || '';
          const rawDefVal = (nf.dbdefault !== null && nf.dbdefault !== undefined && nf.dbdefault !== '') ? nf.dbdefault : (nf.default !== undefined ? nf.default : '');
          const formattedDef = formatSqlDefault(rawDefVal, typeStr);
          if (formattedDef) return `    ${formattedDef} /* 追加カラム "${nf.name}" のデフォルト値 */`;
          const notNullNote = (nf.not_null || nf.notNull || nf.pk) ? ' NOT NULL' : '';
          return `    <<値をセット>> /* 追加カラム "${nf.name}" ${typeStr}${notNullNote} */`;
        }).join(',\n');
        scripts.push({
          filename: `02_data_copy_${tblLower}.sql`,
          content: `-- データ移行: ${tableName} -> ${stagingTableName}\nBEGIN TRANSACTION;\nINSERT INTO "${stagingTableName}" (\n${insertColsMultiline}\n)\nSELECT\n${selectExprsMultiline}\nFROM "${tableName}";\nCOMMIT;\n`,
        });
      } else {
        scripts.push({
          filename: `02_data_copy_${tblLower}.sql`,
          content: `-- データ移行: ${tableName}\n-- 移行対象となる共通カラムが存在しません\n`,
        });
      }

      // Step 3: SWAP WITH によるアトミック切り替え
      scripts.push({
        filename: `03_swap_table_${tblLower}.sql`,
        content: `-- テーブル切り替え (SWAP WITH): ${tableName} <-> ${stagingTableName}\nALTER TABLE "${tableName}" SWAP WITH "${stagingTableName}";\nALTER TABLE "${stagingTableName}" RENAME TO "${backupTableName}";\n`,
      });

      // Step 4: バックアップ削除
      scripts.push({
        filename: `04_drop_backup_${tblLower}.sql`,
        content: `-- 退避テーブル削除（移行データ確認後に実行してください）: ${backupTableName}\nDROP TABLE IF EXISTS "${backupTableName}";\n`,
      });
    } else if (mode === 'DROP') {
      scripts.push({
        filename: `01_drop_table_${tblLower}.sql`,
        content: `-- テーブル削除: ${tableName}\nDROP TABLE IF EXISTS "${tableName}";\n`,
      });
    }

    if (scripts.length > 0) result[tableName] = scripts;
  }

  return result;
}
