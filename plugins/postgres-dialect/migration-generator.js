// 日本語コメント: PostgreSQL マイグレーション SQL 生成器 (plugins/postgres-dialect/migration-generator.js)
// AST 差分比較結果 (diffResult) に基づき、PostgreSQL 向けの安全なデータ移行・再作成 SQL ファイル群を生成します。

function formatSqlDefault(val, dataType) {
  if (val === undefined || val === null) return '';
  const raw = (typeof val === 'object' && val !== null && 'value' in val) ? val.value : val;
  if (raw === undefined || raw === null || String(raw).trim() === '') return '';

  const strVal = String(raw).trim();
  if (strVal.startsWith("'") && strVal.endsWith("'")) {
    return strVal;
  }

  const typeStr = typeof dataType === 'string' ? dataType : (dataType ? (dataType.type_name || '') : '');
  const isStringType = /^(VARCHAR|CHAR|TEXT|UUID|CHARACTER)/i.test(typeStr.trim());
  if (isStringType) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  const lower = strVal.toLowerCase();
  if (['true', 'false', 'null'].includes(lower)) {
    return lower.toUpperCase();
  }
  if (/^(now\(\)|current_timestamp|current_date|gen_random_uuid\(\))/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
    return strVal;
  }
  if (!isNaN(Number(strVal))) {
    return strVal;
  }
  return "'" + strVal.replace(/'/g, "''") + "'";
}

function buildPostgresColumnDef(f) {
  let typeStr = (f.type || f.dataType || 'VARCHAR(255)').toString().trim();
  if (f.increment) {
    if (/^(BIGINT|INT8)/i.test(typeStr)) typeStr = 'BIGSERIAL';
    else if (!/^(SERIAL|BIGSERIAL|SMALLSERIAL)/i.test(typeStr)) typeStr = 'SERIAL';
  }
  const notNull = f.not_null || f.notNull || f.pk ? ' NOT NULL' : '';
  const isSerial = /^(SERIAL|BIGSERIAL|SMALLSERIAL)$/i.test(typeStr);
  const rawDefVal = !isSerial
    ? ((f.dbdefault !== null && f.dbdefault !== undefined && f.dbdefault !== '')
      ? f.dbdefault
      : (f.default !== undefined ? f.default : ''))
    : '';
  const formattedDef = formatSqlDefault(rawDefVal, typeStr);
  const defVal = formattedDef ? ` DEFAULT ${formattedDef}` : '';
  return `  "${f.name}" ${typeStr}${defVal}${notNull}`;
}

function cleanComment(comment) {
  if (!comment) return '';
  let txt = typeof comment === 'object' && comment !== null ? (comment.value || '') : String(comment);
  if (txt.includes('<!-- custom -->')) {
    txt = txt.split('<!-- custom -->')[0];
  }
  txt = txt.trim();
  return txt ? txt.replace(/'/g, "''") : '';
}

function extractComment(obj, commentSource = 'note') {
  if (!obj) return '';
  const note = cleanComment(obj.note);
  const logical = cleanComment(obj.logicalName || (obj.custom && obj.custom.logicalName));
  if (commentSource === 'logicalName') return logical;
  if (commentSource === 'both') {
    if (logical && note) return `${logical}: ${note}`;
    return logical || note || '';
  }
  return note;
}

function extractPrimaryKeyInfo(tbl, fields = [], tableName = '') {
  let pkCols = [];
  let pkName = `PK_${tableName.toUpperCase()}`;
  const pkIndex = tbl.indexes ? tbl.indexes.find(idx => idx.pk || idx.type === 'primary') : null;
  if (pkIndex) {
    pkName = (pkIndex.name || pkName).replace(/["`]/g, '');
    const rawPkCols = pkIndex.columns || pkIndex.fields || [];
    pkCols = rawPkCols.map(c => (typeof c === 'object' ? (c.value || c.name || '') : String(c)).replace(/["`]/g, '').trim()).filter(Boolean);
  } else {
    pkCols = fields.filter(f => f.pk).map(f => f.name.replace(/["`]/g, '').trim());
  }
  return { pkCols, pkName };
}

function extractIndexColumns(idx) {
  if (!idx) return [];
  return (idx.columns || idx.fields || []).map(c => {
    const colName = (typeof c === 'object' && c !== null) ? (c.name || c.value || '') : String(c || '');
    const clean = colName.replace(/["`]/g, '').trim();
    return clean ? `"${clean}"` : null;
  }).filter(Boolean);
}

function buildPostgresFkSql(currentTableName, fk) {
  if (!fk || !fk.toTable) return '';
  const fromTbl = (fk.fromTable || currentTableName).replace(/["`]/g, '');
  const toTbl = fk.toTable.replace(/["`]/g, '');
  const fromCols = (fk.fromCols || []).map(c => `"${(typeof c === 'object' ? (c.name || c.value || '') : String(c)).replace(/["`]/g, '').trim()}"`).filter(c => c !== '""');
  if (fromCols.length === 0) return '';
  const rawToCols = (fk.toCols && fk.toCols.length > 0) ? fk.toCols : fk.fromCols;
  const toCols = rawToCols.map(c => `"${(typeof c === 'object' ? (c.name || c.value || '') : String(c)).replace(/["`]/g, '').trim()}"`).filter(c => c !== '""');
  const fkName = (fk.name || `FK_${fromTbl}_${fromCols.map(c => c.replace(/"/g, '')).join('_')}`).replace(/["`]/g, '');
  const onDelete = fk.onDelete ? ` ON DELETE ${String(fk.onDelete).toUpperCase().trim()}` : '';
  const onUpdate = fk.onUpdate ? ` ON UPDATE ${String(fk.onUpdate).toUpperCase().trim()}` : '';
  return `ALTER TABLE "${fromTbl}" ADD CONSTRAINT "${fkName}" FOREIGN KEY (${fromCols.join(', ')}) REFERENCES "${toTbl}" (${toCols.join(', ')})${onDelete}${onUpdate};`;
}

export function generatePostgresMigrationScripts(diffResult, targetTableNames = [], dialectConfig = {}, options = {}) {
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
    const includeTablespace = options.includeTablespace !== false;

    if (mode === 'CREATE' || mode === 'ADD') {
      const newTbl = tableDiff.newTable || {};
      const custom = newTbl.custom || {};
      const fields = newTbl.fields || newTbl.columns || [];
      const colDefs = fields.map(f => buildPostgresColumnDef(f));
      const { pkCols, pkName } = extractPrimaryKeyInfo(newTbl, fields, tableName);
      if (pkCols.length > 0) {
        colDefs.push(`  CONSTRAINT "${pkName}" PRIMARY KEY (${pkCols.map(c => `"${c}"`).join(', ')})`);
      }
      const tsClause = (includeTablespace && (custom.tablespace || newTbl.tablespace))
        ? ` TABLESPACE "${custom.tablespace || newTbl.tablespace}"`
        : '';

      scripts.push({
        filename: `01_create_table_${tblLower}.sql`,
        content: `-- 新規テーブル作成: ${tableName}\nCREATE TABLE "${tableName}" (\n${colDefs.join(',\n')}\n)${tsClause};\n`,
      });

      const idxLines = [];
      for (const idx of (newTbl.indexes || [])) {
        if (!idx.pk && idx.type !== 'primary') {
          const cols = extractIndexColumns(idx);
          if (cols.length > 0) {
            const uq = idx.unique ? 'UNIQUE ' : '';
            const idxTs = includeTablespace ? (idx.tablespace || custom.index_tablespace || newTbl.indexTablespace) : '';
            const idxTsClause = idxTs ? ` TABLESPACE "${idxTs}"` : '';
            idxLines.push(`CREATE ${uq}INDEX "${idx.name || `IDX_${tableName}`}" ON "${tableName}" (${cols.join(', ')})${idxTsClause};`);
          }
        }
      }

      const fkLines = [];
      for (const pair of (tableDiff.alignedFks || [])) {
        if (['ADDED', 'MODIFIED', 'UNCHANGED'].includes(pair.status) && pair.newFk) {
          const sql = buildPostgresFkSql(tableName, pair.newFk);
          if (sql && !fkLines.includes(sql)) fkLines.push(sql);
        }
      }

      const commentLines = [];
      if (options.includeComment !== false) {
        const cs = options.commentSource || 'note';
        const tc = extractComment(newTbl, cs);
        if (tc) commentLines.push(`COMMENT ON TABLE "${tableName}" IS '${tc}';`);
        for (const f of fields) {
          const cc = extractComment(f, cs);
          if (cc) commentLines.push(`COMMENT ON COLUMN "${tableName}"."${f.name}" IS '${cc}';`);
        }
      }

      const sec = [];
      if (idxLines.length > 0) sec.push(`-- インデックス作成\n${idxLines.join('\n')}`);
      if (fkLines.length > 0) sec.push(`-- 外部キー制約付与\n${fkLines.join('\n')}`);
      if (commentLines.length > 0) sec.push(`-- コメント付与\n${commentLines.join('\n')}`);
      if (sec.length > 0) {
        scripts.push({
          filename: `02_indexes_and_comments_${tblLower}.sql`,
          content: `-- インデックス・外部キー・コメント付与: ${tableName}\n${sec.join('\n\n')}\n`,
        });
      }
    } else if (mode === 'RECREATE_TABLE') {
      const oldTbl = tableDiff.oldTable || {};
      const newTbl = tableDiff.newTable || {};
      const custom = newTbl.custom || {};
      const oldFields = oldTbl.fields || oldTbl.columns || [];
      const newFields = newTbl.fields || newTbl.columns || [];
      const backupTableName = `${tableName}_OLD_${timestamp}`;
      const alignedFks = tableDiff.alignedFks || [];

      // Step 1: 制約・インデックス削除
      const dropLines = [];
      const droppedFks = new Set();
      for (const pair of alignedFks) {
        const fkName = (pair.oldFk?.name || '').replace(/["`]/g, '').trim();
        if (fkName && !droppedFks.has(fkName)) {
          droppedFks.add(fkName);
          dropLines.push(`ALTER TABLE "${tableName}" DROP CONSTRAINT IF EXISTS "${fkName}";`);
        }
      }
      for (const idx of (oldTbl.indexes || [])) {
        if (!idx.pk && idx.type !== 'primary' && idx.name) {
          dropLines.push(`DROP INDEX IF EXISTS "${idx.name.replace(/["`]/g, '').trim()}";`);
        }
      }
      const { pkCols: oldPkCols, pkName: oldPkName } = extractPrimaryKeyInfo(oldTbl, oldFields, tableName);
      if (oldPkCols.length > 0 && oldPkName) {
        dropLines.push(`ALTER TABLE "${tableName}" DROP CONSTRAINT IF EXISTS "${oldPkName}";`);
      }
      scripts.push({
        filename: `01_drop_constraints_and_indexes_${tblLower}.sql`,
        content: `-- 旧制約・インデックス削除: ${tableName}\n${dropLines.length > 0 ? dropLines.join('\n') + '\n' : '-- 削除対象なし\n'}`,
      });

      // Step 2: 退避リネーム
      scripts.push({
        filename: `02_backup_table_${tblLower}.sql`,
        content: `-- テーブル名変更（退避）: ${tableName} -> ${backupTableName}\nALTER TABLE "${tableName}" RENAME TO "${backupTableName}";\n`,
      });

      // Step 3: 新テーブル再作成
      const colDefs = newFields.map(f => buildPostgresColumnDef(f));
      const { pkCols, pkName } = extractPrimaryKeyInfo(newTbl, newFields, tableName);
      if (pkCols.length > 0) {
        colDefs.push(`  CONSTRAINT "${pkName}" PRIMARY KEY (${pkCols.map(c => `"${c}"`).join(', ')})`);
      }
      const tsClause = (includeTablespace && (custom.tablespace || newTbl.tablespace))
        ? ` TABLESPACE "${custom.tablespace || newTbl.tablespace}"`
        : '';
      scripts.push({
        filename: `03_recreate_table_${tblLower}.sql`,
        content: `-- 新定義テーブル作成: ${tableName}\nCREATE TABLE "${tableName}" (\n${colDefs.join(',\n')}\n)${tsClause};\n`,
      });

      // Step 4: データ移行（追加カラム対応）
      const oldColNames = new Set(oldFields.map(f => f.name.toLowerCase()));
      const hasCommonCol = newFields.some(nf => oldColNames.has(nf.name.toLowerCase()));
      if (newFields.length > 0 && hasCommonCol) {
        const insertColsMultiline = newFields.map(nf => `    "${nf.name}"`).join(',\n');
        const selectExprsMultiline = newFields.map(nf => {
          if (oldColNames.has(nf.name.toLowerCase())) {
            return `    "${nf.name}"`;
          }
          const typeStr = nf.type || nf.dataType || '';
          const rawDefVal = (nf.dbdefault !== null && nf.dbdefault !== undefined && nf.dbdefault !== '')
            ? nf.dbdefault
            : (nf.default !== undefined ? nf.default : '');
          const formattedDef = formatSqlDefault(rawDefVal, typeStr);
          if (formattedDef) {
            return `    ${formattedDef} /* 追加カラム "${nf.name}" のデフォルト値 */`;
          }
          const notNullNote = (nf.not_null || nf.notNull || nf.pk) ? ' NOT NULL' : '';
          return `    <<値をセット>> /* 追加カラム "${nf.name}" ${typeStr}${notNullNote} */`;
        }).join(',\n');

        scripts.push({
          filename: `04_data_copy_${tblLower}.sql`,
          content: `-- 旧テーブルから新テーブルへのデータ移行: ${tableName}\nBEGIN;\nINSERT INTO "${tableName}" (\n${insertColsMultiline}\n)\nSELECT\n${selectExprsMultiline}\nFROM "${backupTableName}";\nCOMMIT;\n`,
        });
      } else {
        scripts.push({
          filename: `04_data_copy_${tblLower}.sql`,
          content: `-- 旧テーブルから新テーブルへのデータ移行: ${tableName}\n-- 移行対象となる共通カラムが存在しません\n`,
        });
      }

      // Step 5: インデックス・FK・コメント再作成
      const idxLines = [];
      for (const idx of (newTbl.indexes || [])) {
        if (!idx.pk && idx.type !== 'primary') {
          const cols = extractIndexColumns(idx);
          if (cols.length > 0) {
            const uq = idx.unique ? 'UNIQUE ' : '';
            const idxTs = includeTablespace ? (idx.tablespace || custom.index_tablespace || newTbl.indexTablespace) : '';
            const idxTsClause = idxTs ? ` TABLESPACE "${idxTs}"` : '';
            idxLines.push(`CREATE ${uq}INDEX "${idx.name || `IDX_${tableName}`}" ON "${tableName}" (${cols.join(', ')})${idxTsClause};`);
          }
        }
      }
      const fkLines = [];
      for (const pair of alignedFks) {
        if (pair.newFk) {
          const sql = buildPostgresFkSql(tableName, pair.newFk);
          if (sql && !fkLines.includes(sql)) fkLines.push(sql);
        }
      }
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
      const sec = [];
      if (idxLines.length > 0) sec.push(`-- インデックス再作成\n${idxLines.join('\n')}`);
      if (fkLines.length > 0) sec.push(`-- 外部キー制約再作成\n${fkLines.join('\n')}`);
      if (commentLines.length > 0) sec.push(`-- コメント付与\n${commentLines.join('\n')}`);
      scripts.push({
        filename: `05_indexes_fk_comments_${tblLower}.sql`,
        content: `-- インデックス・外部キー・コメント再作成: ${tableName}\n${sec.length > 0 ? sec.join('\n\n') + '\n' : '-- 対象なし\n'}`,
      });

      // Step 6: バックアップ削除
      scripts.push({
        filename: `06_drop_backup_${tblLower}.sql`,
        content: `-- 退避テーブル削除（移行データ確認後に実行してください）: ${backupTableName}\nDROP TABLE IF EXISTS "${backupTableName}" CASCADE;\n`,
      });
    } else if (mode === 'DROP') {
      scripts.push({
        filename: `01_drop_table_${tblLower}.sql`,
        content: `-- テーブル削除: ${tableName}\nDROP TABLE IF EXISTS "${tableName}" CASCADE;\n`,
      });
    }

    if (scripts.length > 0) {
      result[tableName] = scripts;
    }
  }

  return result;
}
