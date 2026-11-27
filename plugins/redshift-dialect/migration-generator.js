// 日本語コメント: Amazon Redshift マイグレーション SQL 生成器 (plugins/redshift-dialect/migration-generator.js)

function formatSqlDefault(val, dataType) {
  if (val === undefined || val === null) return '';
  const raw = (typeof val === 'object' && val !== null && 'value' in val) ? val.value : val;
  if (raw === undefined || raw === null || String(raw).trim() === '') return '';
  const strVal = String(raw).trim();
  if (strVal.startsWith("'") && strVal.endsWith("'")) return strVal;

  const typeStr = typeof dataType === 'string' ? dataType : (dataType ? (dataType.type_name || '') : '');
  if (/^(VARCHAR|CHAR|TEXT)/i.test(typeStr.trim())) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  const lower = strVal.toLowerCase();
  if (['true', 'false', 'null'].includes(lower)) return lower.toUpperCase();
  if (/^(getdate\(\)|sysdate|current_timestamp|current_date)/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
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

function buildRedshiftColumnDef(f) {
  const typeStr = f.type || f.dataType || 'VARCHAR(256)';
  const inc = f.increment ? ' IDENTITY(1,1)' : '';
  const notNull = f.not_null || f.notNull || f.pk ? ' NOT NULL' : '';
  const rawDefVal = !f.increment ? ((f.dbdefault !== null && f.dbdefault !== undefined && f.dbdefault !== '') ? f.dbdefault : (f.default !== undefined ? f.default : '')) : '';
  const formattedDef = formatSqlDefault(rawDefVal, typeStr);
  const defVal = formattedDef ? ` DEFAULT ${formattedDef}` : '';
  return `  "${f.name}" ${typeStr}${inc}${defVal}${notNull}`;
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

function buildRedshiftPhysicalClauses(tbl) {
  const custom = tbl.custom || {};
  const clauses = [];
  if (custom.diststyle) clauses.push(`DISTSTYLE ${custom.diststyle}`);
  if (custom.distkey) clauses.push(`DISTKEY ("${custom.distkey}")`);
  if (custom.sortkey) clauses.push(`SORTKEY (${custom.sortkey})`);
  return clauses.length > 0 ? ('\n' + clauses.join('\n')) : '';
}

export function generateRedshiftMigrationScripts(diffResult, targetTableNames = [], dialectConfig = {}, options = {}) {
  const result = {};
  if (!diffResult || !Array.isArray(diffResult.tables)) return result;

  const targetSet = new Set(targetTableNames.map(n => n.toLowerCase()));
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

  for (const tableDiff of diffResult.tables) {
    const tableName = tableDiff.name || '';
    if (targetTableNames.length > 0 && !targetSet.has(tableName.toLowerCase())) continue;

    const tblLower = tableName.toLowerCase();
    const scripts = [];
    const mode = tableDiff.migrationMode || tableDiff.status;

    if (mode === 'CREATE' || mode === 'ADD') {
      const newTbl = tableDiff.newTable || {};
      const fields = newTbl.fields || newTbl.columns || [];
      const colDefs = fields.map(f => buildRedshiftColumnDef(f));
      const { pkCols, pkName } = extractPrimaryKeyInfo(newTbl, fields, tableName);
      if (pkCols.length > 0) {
        colDefs.push(`  CONSTRAINT "${pkName}" PRIMARY KEY (${pkCols.map(c => `"${c}"`).join(', ')})`);
      }
      const clauses = buildRedshiftPhysicalClauses(newTbl);
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

      // Step 1: 退避リネーム
      scripts.push({
        filename: `01_backup_table_${tblLower}.sql`,
        content: `-- テーブル名変更（退避）: ${tableName} -> ${backupTableName}\nALTER TABLE "${tableName}" RENAME TO "${backupTableName}";\n`,
      });

      // Step 2: 新テーブル再作成
      const colDefs = newFields.map(f => buildRedshiftColumnDef(f));
      const { pkCols, pkName } = extractPrimaryKeyInfo(newTbl, newFields, tableName);
      if (pkCols.length > 0) {
        colDefs.push(`  CONSTRAINT "${pkName}" PRIMARY KEY (${pkCols.map(c => `"${c}"`).join(', ')})`);
      }
      const clauses = buildRedshiftPhysicalClauses(newTbl);
      scripts.push({
        filename: `02_recreate_table_${tblLower}.sql`,
        content: `-- 新定義テーブル作成: ${tableName}\nCREATE TABLE "${tableName}" (\n${colDefs.join(',\n')}\n)${clauses};\n`,
      });

      // Step 3: データ移行（追加カラム対応）
      const oldColNames = new Set(oldFields.map(f => f.name.toLowerCase()));
      const hasCommonCol = newFields.some(nf => oldColNames.has(nf.name.toLowerCase()));
      if (newFields.length > 0 && hasCommonCol) {
        const insertColsMultiline = newFields.map(nf => `    "${nf.name}"`).join(',\n');
        const selectExprsMultiline = newFields.map(nf => {
          if (oldColNames.has(nf.name.toLowerCase())) return `    "${nf.name}"`;
          const typeStr = nf.type || nf.dataType || '';
          const rawDefVal = (nf.dbdefault !== null && nf.dbdefault !== undefined && nf.dbdefault !== '') ? nf.dbdefault : (nf.default !== undefined ? nf.default : '');
          const formattedDef = formatSqlDefault(rawDefVal, typeStr);
          if (formattedDef) return `    ${formattedDef} /* 追加カラム "${nf.name}" のデフォルト値 */`;
          const notNullNote = (nf.not_null || nf.notNull || nf.pk) ? ' NOT NULL' : '';
          return `    <<値をセット>> /* 追加カラム "${nf.name}" ${typeStr}${notNullNote} */`;
        }).join(',\n');

        scripts.push({
          filename: `03_data_copy_${tblLower}.sql`,
          content: `-- 旧テーブルから新テーブルへのデータ移行: ${tableName}\nBEGIN;\nINSERT INTO "${tableName}" (\n${insertColsMultiline}\n)\nSELECT\n${selectExprsMultiline}\nFROM "${backupTableName}";\nCOMMIT;\n`,
        });
      } else {
        scripts.push({
          filename: `03_data_copy_${tblLower}.sql`,
          content: `-- 旧テーブルから新テーブルへのデータ移行: ${tableName}\n-- 移行対象となる共通カラムが存在しません\n`,
        });
      }

      // Step 4: コメント再作成
      const commentLines = [];
      if (options.includeComment !== false) {
        const cs = options.commentSource || 'note';
        const tc = extractComment(newTbl, cs);
        if (tc) commentLines.push(`COMMENT ON TABLE "${tableName}" IS '${tc}';`);
        for (const f of newFields) {
          const cc = extractComment(f, cs);
          if (cc) commentLines.push(`COMMENT ON COLUMN "${tableName}"."${f.name}" IS '${cc}';`);
        }
      }
      if (commentLines.length > 0) {
        scripts.push({
          filename: `04_comments_${tblLower}.sql`,
          content: `-- コメント付与: ${tableName}\n${commentLines.join('\n')}\n`,
        });
      }

      // Step 5: バックアップ削除
      scripts.push({
        filename: `05_drop_backup_${tblLower}.sql`,
        content: `-- 退避テーブル削除（移行データ確認後に実行してください）: ${backupTableName}\nDROP TABLE IF EXISTS "${backupTableName}" CASCADE;\n`,
      });
    } else if (mode === 'DROP') {
      scripts.push({
        filename: `01_drop_table_${tblLower}.sql`,
        content: `-- テーブル削除: ${tableName}\nDROP TABLE IF EXISTS "${tableName}" CASCADE;\n`,
      });
    }

    if (scripts.length > 0) result[tableName] = scripts;
  }

  return result;
}
