// 日本語コメント: Google BigQuery マイグレーション SQL 生成器 (plugins/bigquery-dialect/migration-generator.js)

function formatSqlDefault(val, dataType) {
  if (val === undefined || val === null) return '';
  const raw = (typeof val === 'object' && val !== null && 'value' in val) ? val.value : val;
  if (raw === undefined || raw === null || String(raw).trim() === '') return '';
  const strVal = String(raw).trim();
  if (strVal.startsWith("'") && strVal.endsWith("'")) return strVal;

  const typeStr = typeof dataType === 'string' ? dataType : (dataType ? (dataType.type_name || '') : '');
  if (/^(STRING)/i.test(typeStr.trim())) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  const lower = strVal.toLowerCase();
  if (['true', 'false', 'null'].includes(lower)) return lower.toUpperCase();
  if (/^(current_timestamp|current_date|current_datetime|generate_uuid\(\))/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
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
  return txt ? txt.replace(/\\/g, '\\\\').replace(/"/g, '\\"') : '';
}

function extractComment(obj, commentSource = 'note') {
  if (!obj) return '';
  const note = cleanComment(obj.note);
  const logical = cleanComment(obj.logicalName || (obj.custom && obj.custom.logicalName));
  if (commentSource === 'logicalName') return logical;
  if (commentSource === 'both') return (logical && note) ? `${logical}: ${note}` : (logical || note || '');
  return note;
}

function buildBqColumnDef(f, options = {}) {
  const typeStr = f.type || f.dataType || 'STRING';
  const notNull = f.not_null || f.notNull || f.pk ? ' NOT NULL' : '';
  const rawDefVal = (f.dbdefault !== null && f.dbdefault !== undefined && f.dbdefault !== '') ? f.dbdefault : (f.default !== undefined ? f.default : '');
  const formattedDef = formatSqlDefault(rawDefVal, typeStr);
  const defVal = formattedDef ? ` DEFAULT ${formattedDef}` : '';
  const colComment = options.includeComment !== false ? extractComment(f, options.commentSource || 'note') : '';
  const optClause = colComment ? ` OPTIONS(description="${colComment}")` : '';
  return `  \`${f.name}\` ${typeStr}${defVal}${notNull}${optClause}`;
}

function extractPrimaryKeyCols(tbl, fields = []) {
  const pkIndex = tbl.indexes ? tbl.indexes.find(idx => idx.pk || idx.type === 'primary') : null;
  if (pkIndex) {
    const raw = pkIndex.columns || pkIndex.fields || [];
    return raw.map(c => (typeof c === 'object' ? (c.value || c.name || '') : String(c)).replace(/["`]/g, '').trim()).filter(Boolean);
  }
  return fields.filter(f => f.pk).map(f => f.name.replace(/["`]/g, '').trim());
}

function buildBqTableClauses(tbl, options = {}) {
  const custom = tbl.custom || {};
  const clauses = [];
  if (custom.partition_by) clauses.push(`PARTITION BY ${custom.partition_by}`);
  if (custom.cluster_by) clauses.push(`CLUSTER BY ${custom.cluster_by}`);
  if (options.includeComment !== false) {
    const tc = extractComment(tbl, options.commentSource || 'note');
    if (tc) clauses.push(`OPTIONS(description="${tc}")`);
  }
  return clauses.length > 0 ? ('\n' + clauses.join('\n')) : '';
}

export function generateBigqueryMigrationScripts(diffResult, targetTableNames = [], dialectConfig = {}, options = {}) {
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
      const ds = newTbl.custom?.dataset || 'my_dataset';
      const fields = newTbl.fields || newTbl.columns || [];
      const colDefs = fields.map(f => buildBqColumnDef(f, options));
      const pkCols = extractPrimaryKeyCols(newTbl, fields);
      if (pkCols.length > 0) {
        colDefs.push(`  PRIMARY KEY (${pkCols.map(c => `\`${c}\``).join(', ')}) NOT ENFORCED`);
      }
      const clauses = buildBqTableClauses(newTbl, options);
      scripts.push({
        filename: `01_create_table_${tblLower}.sql`,
        content: `-- 新規テーブル作成: ${ds}.${tableName}\nCREATE TABLE \`${ds}.${tableName}\` (\n${colDefs.join(',\n')}\n)${clauses};\n`,
      });
    } else if (mode === 'RECREATE_TABLE') {
      const oldTbl = tableDiff.oldTable || {};
      const newTbl = tableDiff.newTable || {};
      const ds = newTbl.custom?.dataset || oldTbl.custom?.dataset || 'my_dataset';
      const oldFields = oldTbl.fields || oldTbl.columns || [];
      const newFields = newTbl.fields || newTbl.columns || [];
      const backupTableName = `${tableName}_OLD_${timestamp}`;

      // Step 1: 退避テーブル作成（CLONE）
      scripts.push({
        filename: `01_backup_table_${tblLower}.sql`,
        content: `-- テーブル退避 (CLONE): ${ds}.${tableName} -> ${ds}.${backupTableName}\nCREATE TABLE \`${ds}.${backupTableName}\` CLONE \`${ds}.${tableName}\`;\nDROP TABLE IF EXISTS \`${ds}.${tableName}\`;\n`,
      });

      // Step 2: 新定義テーブル作成
      const colDefs = newFields.map(f => buildBqColumnDef(f, options));
      const pkCols = extractPrimaryKeyCols(newTbl, newFields);
      if (pkCols.length > 0) {
        colDefs.push(`  PRIMARY KEY (${pkCols.map(c => `\`${c}\``).join(', ')}) NOT ENFORCED`);
      }
      const clauses = buildBqTableClauses(newTbl, options);
      scripts.push({
        filename: `02_recreate_table_${tblLower}.sql`,
        content: `-- 新定義テーブル作成: ${ds}.${tableName}\nCREATE TABLE \`${ds}.${tableName}\` (\n${colDefs.join(',\n')}\n)${clauses};\n`,
      });

      // Step 3: データ移行（追加カラム対応）
      const oldColNames = new Set(oldFields.map(f => f.name.toLowerCase()));
      const hasCommonCol = newFields.some(nf => oldColNames.has(nf.name.toLowerCase()));
      if (newFields.length > 0 && hasCommonCol) {
        const insertColsMultiline = newFields.map(nf => `    \`${nf.name}\``).join(',\n');
        const selectExprsMultiline = newFields.map(nf => {
          if (oldColNames.has(nf.name.toLowerCase())) return `    \`${nf.name}\``;
          const typeStr = nf.type || nf.dataType || '';
          const rawDefVal = (nf.dbdefault !== null && nf.dbdefault !== undefined && nf.dbdefault !== '') ? nf.dbdefault : (nf.default !== undefined ? nf.default : '');
          const formattedDef = formatSqlDefault(rawDefVal, typeStr);
          if (formattedDef) return `    ${formattedDef} /* 追加カラム \`${nf.name}\` のデフォルト値 */`;
          const notNullNote = (nf.not_null || nf.notNull || nf.pk) ? ' NOT NULL' : '';
          return `    <<値をセット>> /* 追加カラム \`${nf.name}\` ${typeStr}${notNullNote} */`;
        }).join(',\n');

        scripts.push({
          filename: `03_data_copy_${tblLower}.sql`,
          content: `-- 旧テーブルから新テーブルへのデータ移行: ${ds}.${tableName}\nINSERT INTO \`${ds}.${tableName}\` (\n${insertColsMultiline}\n)\nSELECT\n${selectExprsMultiline}\nFROM \`${ds}.${backupTableName}\`;\n`,
        });
      } else {
        scripts.push({
          filename: `03_data_copy_${tblLower}.sql`,
          content: `-- 旧テーブルから新テーブルへのデータ移行: ${ds}.${tableName}\n-- 移行対象となる共通カラムが存在しません\n`,
        });
      }

      // Step 4: バックアップ削除
      scripts.push({
        filename: `04_drop_backup_${tblLower}.sql`,
        content: `-- 退避テーブル削除（移行データ確認後に実行してください）: ${ds}.${backupTableName}\nDROP TABLE IF EXISTS \`${ds}.${backupTableName}\`;\n`,
      });
    } else if (mode === 'DROP') {
      const oldTbl = tableDiff.oldTable || {};
      const ds = oldTbl.custom?.dataset || 'my_dataset';
      scripts.push({
        filename: `01_drop_table_${tblLower}.sql`,
        content: `-- テーブル削除: ${ds}.${tableName}\nDROP TABLE IF EXISTS \`${ds}.${tableName}\`;\n`,
      });
    }

    if (scripts.length > 0) result[tableName] = scripts;
  }

  return result;
}
