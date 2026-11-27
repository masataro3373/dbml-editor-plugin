// 日本語コメント: MySQL / MariaDB マイグレーション SQL 生成器 (plugins/mysql-dialect/migration-generator.js)

function formatSqlDefault(val, dataType) {
  if (val === undefined || val === null) return '';
  const raw = (typeof val === 'object' && val !== null && 'value' in val) ? val.value : val;
  if (raw === undefined || raw === null || String(raw).trim() === '') return '';

  const strVal = String(raw).trim();
  if (strVal.startsWith("'") && strVal.endsWith("'")) {
    return strVal;
  }

  const typeStr = typeof dataType === 'string' ? dataType : (dataType ? (dataType.type_name || '') : '');
  const isStringType = /^(VARCHAR|CHAR|TEXT|MEDIUMTEXT|LONGTEXT|TINYTEXT)/i.test(typeStr.trim());
  if (isStringType) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  const lower = strVal.toLowerCase();
  if (['true', 'false', 'null'].includes(lower)) {
    return lower.toUpperCase();
  }
  if (/^(now\(\)|current_timestamp|current_date)/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
    return strVal;
  }
  if (!isNaN(Number(strVal))) {
    return strVal;
  }
  return "'" + strVal.replace(/'/g, "''") + "'";
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

function buildMysqlColumnDef(f, options = {}) {
  const typeStr = f.type || f.dataType || 'VARCHAR(255)';
  const notNull = f.not_null || f.notNull || f.pk ? ' NOT NULL' : '';
  const autoInc = f.increment ? ' AUTO_INCREMENT' : '';
  const rawDefVal = (f.dbdefault !== null && f.dbdefault !== undefined && f.dbdefault !== '')
    ? f.dbdefault
    : (f.default !== undefined ? f.default : '');
  const formattedDef = formatSqlDefault(rawDefVal, typeStr);
  const defVal = formattedDef ? ` DEFAULT ${formattedDef}` : '';
  const colComment = options.includeComment !== false ? extractComment(f, options.commentSource || 'note') : '';
  const commentClause = colComment ? ` COMMENT '${colComment}'` : '';
  return `  \`${f.name}\` ${typeStr}${notNull}${autoInc}${defVal}${commentClause}`;
}

function extractPrimaryKeyCols(tbl, fields = []) {
  const pkIndex = tbl.indexes ? tbl.indexes.find(idx => idx.pk || idx.type === 'primary') : null;
  if (pkIndex) {
    const raw = pkIndex.columns || pkIndex.fields || [];
    return raw.map(c => (typeof c === 'object' ? (c.value || c.name || '') : String(c)).replace(/["`]/g, '').trim()).filter(Boolean);
  }
  return fields.filter(f => f.pk).map(f => f.name.replace(/["`]/g, '').trim());
}

function extractIndexColumns(idx) {
  if (!idx) return [];
  return (idx.columns || idx.fields || []).map(c => {
    const colName = (typeof c === 'object' && c !== null) ? (c.name || c.value || '') : String(c || '');
    const clean = colName.replace(/["`]/g, '').trim();
    return clean ? `\`${clean}\`` : null;
  }).filter(Boolean);
}

function buildMysqlFkSql(currentTableName, fk) {
  if (!fk || !fk.toTable) return '';
  const fromTbl = (fk.fromTable || currentTableName).replace(/["`]/g, '');
  const toTbl = fk.toTable.replace(/["`]/g, '');
  const fromCols = (fk.fromCols || []).map(c => `\`${(typeof c === 'object' ? (c.name || c.value || '') : String(c)).replace(/["`]/g, '').trim()}\``).filter(c => c !== '``');
  if (fromCols.length === 0) return '';
  const rawToCols = (fk.toCols && fk.toCols.length > 0) ? fk.toCols : fk.fromCols;
  const toCols = rawToCols.map(c => `\`${(typeof c === 'object' ? (c.name || c.value || '') : String(c)).replace(/["`]/g, '').trim()}\``).filter(c => c !== '``');
  const fkName = (fk.name || `FK_${fromTbl}_${fromCols.map(c => c.replace(/`/g, '')).join('_')}`).replace(/["`]/g, '');
  const onDelete = fk.onDelete ? ` ON DELETE ${String(fk.onDelete).toUpperCase().trim()}` : '';
  const onUpdate = fk.onUpdate ? ` ON UPDATE ${String(fk.onUpdate).toUpperCase().trim()}` : '';
  return `ALTER TABLE \`${fromTbl}\` ADD CONSTRAINT \`${fkName}\` FOREIGN KEY (${fromCols.join(', ')}) REFERENCES \`${toTbl}\` (${toCols.join(', ')})${onDelete}${onUpdate};`;
}

function buildTableOptionsClause(tbl, options = {}) {
  const custom = tbl.custom || {};
  const engine = custom.engine || 'InnoDB';
  const charset = custom.charset || 'utf8mb4';
  const collate = custom.collate ? ` COLLATE=${custom.collate}` : '';
  const tblComment = options.includeComment !== false ? extractComment(tbl, options.commentSource || 'note') : '';
  const commentClause = tblComment ? ` COMMENT='${tblComment}'` : '';
  return ` ENGINE=${engine} DEFAULT CHARSET=${charset}${collate}${commentClause}`;
}

export function generateMysqlMigrationScripts(diffResult, targetTableNames = [], dialectConfig = {}, options = {}) {
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
      const colDefs = fields.map(f => buildMysqlColumnDef(f, options));
      const pkCols = extractPrimaryKeyCols(newTbl, fields);
      if (pkCols.length > 0) {
        colDefs.push(`  PRIMARY KEY (${pkCols.map(c => `\`${c}\``).join(', ')})`);
      }
      const tblOpts = buildTableOptionsClause(newTbl, options);
      scripts.push({
        filename: `01_create_table_${tblLower}.sql`,
        content: `-- 新規テーブル作成: ${tableName}\nCREATE TABLE \`${tableName}\` (\n${colDefs.join(',\n')}\n)${tblOpts};\n`,
      });

      const idxLines = [];
      for (const idx of (newTbl.indexes || [])) {
        if (!idx.pk && idx.type !== 'primary') {
          const cols = extractIndexColumns(idx);
          if (cols.length > 0) {
            const uq = idx.unique ? 'UNIQUE ' : '';
            idxLines.push(`CREATE ${uq}INDEX \`${idx.name || `IDX_${tableName}`}\` ON \`${tableName}\` (${cols.join(', ')});`);
          }
        }
      }
      const fkLines = [];
      for (const pair of (tableDiff.alignedFks || [])) {
        if (['ADDED', 'MODIFIED', 'UNCHANGED'].includes(pair.status) && pair.newFk) {
          const sql = buildMysqlFkSql(tableName, pair.newFk);
          if (sql && !fkLines.includes(sql)) fkLines.push(sql);
        }
      }
      const sec = [];
      if (idxLines.length > 0) sec.push(`-- インデックス作成\n${idxLines.join('\n')}`);
      if (fkLines.length > 0) sec.push(`-- 外部キー制約付与\n${fkLines.join('\n')}`);
      if (sec.length > 0) {
        scripts.push({
          filename: `02_indexes_and_fk_${tblLower}.sql`,
          content: `-- インデックス・外部キー付与: ${tableName}\n${sec.join('\n\n')}\n`,
        });
      }
    } else if (mode === 'RECREATE_TABLE') {
      const oldTbl = tableDiff.oldTable || {};
      const newTbl = tableDiff.newTable || {};
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
          dropLines.push(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${fkName}\`;`);
        }
      }
      for (const idx of (oldTbl.indexes || [])) {
        if (!idx.pk && idx.type !== 'primary' && idx.name) {
          dropLines.push(`DROP INDEX \`${idx.name.replace(/["`]/g, '').trim()}\` ON \`${tableName}\`;`);
        }
      }
      // 日本語コメント: MySQL では AUTO_INCREMENT カラムが存在するテーブルに対して DROP PRIMARY KEY を実行すると ERROR 1075 となるため除外する（Step 2 でリネーム退避し Step 6 で削除される）
      const hasAutoIncrement = oldFields.some(f => f.increment);
      const oldPkCols = extractPrimaryKeyCols(oldTbl, oldFields);
      if (oldPkCols.length > 0 && !hasAutoIncrement) {
        dropLines.push(`ALTER TABLE \`${tableName}\` DROP PRIMARY KEY;`);
      }
      scripts.push({
        filename: `01_drop_constraints_and_indexes_${tblLower}.sql`,
        content: `-- 旧制約・インデックス削除: ${tableName}\n${dropLines.length > 0 ? dropLines.join('\n') + '\n' : '-- 削除対象なし\n'}`,
      });

      // Step 2: 退避リネーム
      scripts.push({
        filename: `02_backup_table_${tblLower}.sql`,
        content: `-- テーブル名変更（退避）: ${tableName} -> ${backupTableName}\nRENAME TABLE \`${tableName}\` TO \`${backupTableName}\`;\n`,
      });

      // Step 3: 新テーブル再作成
      const colDefs = newFields.map(f => buildMysqlColumnDef(f, options));
      const pkCols = extractPrimaryKeyCols(newTbl, newFields);
      if (pkCols.length > 0) {
        colDefs.push(`  PRIMARY KEY (${pkCols.map(c => `\`${c}\``).join(', ')})`);
      }
      const tblOpts = buildTableOptionsClause(newTbl, options);
      scripts.push({
        filename: `03_recreate_table_${tblLower}.sql`,
        content: `-- 新定義テーブル作成: ${tableName}\nCREATE TABLE \`${tableName}\` (\n${colDefs.join(',\n')}\n)${tblOpts};\n`,
      });

      // Step 4: データ移行（追加カラム対応）
      const oldColNames = new Set(oldFields.map(f => f.name.toLowerCase()));
      const hasCommonCol = newFields.some(nf => oldColNames.has(nf.name.toLowerCase()));
      if (newFields.length > 0 && hasCommonCol) {
        const insertColsMultiline = newFields.map(nf => `    \`${nf.name}\``).join(',\n');
        const selectExprsMultiline = newFields.map(nf => {
          if (oldColNames.has(nf.name.toLowerCase())) {
            return `    \`${nf.name}\``;
          }
          const typeStr = nf.type || nf.dataType || '';
          const rawDefVal = (nf.dbdefault !== null && nf.dbdefault !== undefined && nf.dbdefault !== '')
            ? nf.dbdefault
            : (nf.default !== undefined ? nf.default : '');
          const formattedDef = formatSqlDefault(rawDefVal, typeStr);
          if (formattedDef) {
            return `    ${formattedDef} /* 追加カラム \`${nf.name}\` のデフォルト値 */`;
          }
          const notNullNote = (nf.not_null || nf.notNull || nf.pk) ? ' NOT NULL' : '';
          return `    <<値をセット>> /* 追加カラム \`${nf.name}\` ${typeStr}${notNullNote} */`;
        }).join(',\n');

        scripts.push({
          filename: `04_data_copy_${tblLower}.sql`,
          content: `-- 旧テーブルから新テーブルへのデータ移行: ${tableName}\nSTART TRANSACTION;\nINSERT INTO \`${tableName}\` (\n${insertColsMultiline}\n)\nSELECT\n${selectExprsMultiline}\nFROM \`${backupTableName}\`;\nCOMMIT;\n`,
        });
      } else {
        scripts.push({
          filename: `04_data_copy_${tblLower}.sql`,
          content: `-- 旧テーブルから新テーブルへのデータ移行: ${tableName}\n-- 移行対象となる共通カラムが存在しません\n`,
        });
      }

      // Step 5: インデックス・FK再作成
      const idxLines = [];
      for (const idx of (newTbl.indexes || [])) {
        if (!idx.pk && idx.type !== 'primary') {
          const cols = extractIndexColumns(idx);
          if (cols.length > 0) {
            const uq = idx.unique ? 'UNIQUE ' : '';
            idxLines.push(`CREATE ${uq}INDEX \`${idx.name || `IDX_${tableName}`}\` ON \`${tableName}\` (${cols.join(', ')});`);
          }
        }
      }
      const fkLines = [];
      for (const pair of alignedFks) {
        if (pair.newFk) {
          const sql = buildMysqlFkSql(tableName, pair.newFk);
          if (sql && !fkLines.includes(sql)) fkLines.push(sql);
        }
      }
      const sec = [];
      if (idxLines.length > 0) sec.push(`-- インデックス再作成\n${idxLines.join('\n')}`);
      if (fkLines.length > 0) sec.push(`-- 外部キー制約再作成\n${fkLines.join('\n')}`);
      scripts.push({
        filename: `05_indexes_and_fk_${tblLower}.sql`,
        content: `-- インデックス・外部キー再作成: ${tableName}\n${sec.length > 0 ? sec.join('\n\n') + '\n' : '-- 対象なし\n'}`,
      });

      // Step 6: バックアップ削除
      scripts.push({
        filename: `06_drop_backup_${tblLower}.sql`,
        content: `-- 退避テーブル削除（移行データ確認後に実行してください）: ${backupTableName}\nDROP TABLE IF EXISTS \`${backupTableName}\`;\n`,
      });
    } else if (mode === 'DROP') {
      scripts.push({
        filename: `01_drop_table_${tblLower}.sql`,
        content: `-- テーブル削除: ${tableName}\nDROP TABLE IF EXISTS \`${tableName}\`;\n`,
      });
    }

    if (scripts.length > 0) {
      result[tableName] = scripts;
    }
  }

  return result;
}
