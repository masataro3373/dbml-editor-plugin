// 日本語コメント: Google Cloud Spanner マイグレーション SQL 生成器 (plugins/spanner-dialect/migration-generator.js)

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
  if (/^(current_timestamp|current_date|generate_uuid\(\))/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
    return strVal;
  }
  if (!isNaN(Number(strVal))) return strVal;
  return "'" + strVal.replace(/'/g, "''") + "'";
}

function buildSpannerColumnDef(f) {
  const typeStr = f.type || f.dataType || 'STRING(255)';
  const notNull = f.not_null || f.notNull || f.pk ? ' NOT NULL' : '';
  const rawDefVal = (f.dbdefault !== null && f.dbdefault !== undefined && f.dbdefault !== '') ? f.dbdefault : (f.default !== undefined ? f.default : '');
  const formattedDef = formatSqlDefault(rawDefVal, typeStr);
  const defVal = formattedDef ? ` DEFAULT (${formattedDef})` : '';
  return `  \`${f.name}\` ${typeStr}${notNull}${defVal}`;
}

function extractPrimaryKeyCols(tbl, fields = []) {
  const pkIndex = tbl.indexes ? tbl.indexes.find(idx => idx.pk || idx.type === 'primary') : null;
  if (pkIndex) {
    const raw = pkIndex.columns || pkIndex.fields || [];
    return raw.map(c => (typeof c === 'object' ? (c.value || c.name || '') : String(c)).replace(/["`]/g, '').trim()).filter(Boolean);
  }
  return fields.filter(f => f.pk).map(f => f.name.replace(/["`]/g, '').trim());
}

function buildSpannerCreateTableSql(tableName, tbl, fields) {
  const colDefs = fields.map(f => buildSpannerColumnDef(f));
  const pkCols = extractPrimaryKeyCols(tbl, fields);
  const pkClause = pkCols.length > 0 ? ` PRIMARY KEY (${pkCols.map(c => `\`${c}\``).join(', ')})` : '';
  const custom = tbl.custom || {};
  const extra = [];
  if (custom.interleave_in_parent) {
    const onDel = custom.on_delete_action ? ` ON DELETE ${custom.on_delete_action}` : '';
    extra.push(`  INTERLEAVE IN PARENT \`${custom.interleave_in_parent}\`${onDel}`);
  }
  if (custom.row_deletion_policy) {
    extra.push(`  ROW DELETION POLICY (${custom.row_deletion_policy})`);
  }
  const extraStr = extra.length > 0 ? `,\n${extra.join(',\n')}` : '';
  return `CREATE TABLE \`${tableName}\` (\n${colDefs.join(',\n')}\n)${pkClause}${extraStr};`;
}

export function generateSpannerMigrationScripts(diffResult, targetTableNames = [], dialectConfig = {}, options = {}) {
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
      scripts.push({
        filename: `01_create_table_${tblLower}.sql`,
        content: `-- 新規テーブル作成: ${tableName}\n${buildSpannerCreateTableSql(tableName, newTbl, fields)}\n`,
      });
    } else if (mode === 'RECREATE_TABLE') {
      const oldTbl = tableDiff.oldTable || {};
      const newTbl = tableDiff.newTable || {};
      const oldFields = oldTbl.fields || oldTbl.columns || [];
      const newFields = newTbl.fields || newTbl.columns || [];
      const stagingTableName = `${tableName}_NEW_${timestamp}`;

      // Step 1: 新定義ステージングテーブル作成
      scripts.push({
        filename: `01_create_staging_table_${tblLower}.sql`,
        content: `-- 新定義ステージングテーブル作成: ${stagingTableName}\n${buildSpannerCreateTableSql(stagingTableName, newTbl, newFields)}\n`,
      });

      // Step 2: データ移行（追加カラム対応）
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
          filename: `02_data_copy_${tblLower}.sql`,
          content: `-- データ移行: ${tableName} -> ${stagingTableName}\nINSERT INTO \`${stagingTableName}\` (\n${insertColsMultiline}\n)\nSELECT\n${selectExprsMultiline}\nFROM \`${tableName}\`;\n`,
        });
      } else {
        scripts.push({
          filename: `02_data_copy_${tblLower}.sql`,
          content: `-- データ移行: ${tableName}\n-- 移行対象となる共通カラムが存在しません\n`,
        });
      }

      // Step 3: 旧テーブル削除＆リネーム切り替え
      scripts.push({
        filename: `03_switch_table_${tblLower}.sql`,
        content: `-- 旧テーブル削除および新テーブルへの切り替え: ${tableName}\nDROP TABLE \`${tableName}\`;\nRENAME TABLE \`${stagingTableName}\` TO \`${tableName}\`;\n`,
      });
    } else if (mode === 'DROP') {
      scripts.push({
        filename: `01_drop_table_${tblLower}.sql`,
        content: `-- テーブル削除: ${tableName}\nDROP TABLE \`${tableName}\`;\n`,
      });
    }

    if (scripts.length > 0) result[tableName] = scripts;
  }

  return result;
}
