// 日本語コメント: SQL Server / MS-SQL マイグレーション SQL 生成器 (plugins/mssql-dialect/migration-generator.js)

function formatSqlDefault(val, dataType) {
  if (val === undefined || val === null) return '';
  const raw = (typeof val === 'object' && val !== null && 'value' in val) ? val.value : val;
  if (raw === undefined || raw === null || String(raw).trim() === '') return '';

  const strVal = String(raw).trim();
  if (strVal.startsWith("'") && strVal.endsWith("'")) {
    return strVal;
  }

  const typeStr = typeof dataType === 'string' ? dataType : (dataType ? (dataType.type_name || '') : '');
  const isUnicodeStr = /^(NVARCHAR|NCHAR|NTEXT)/i.test(typeStr.trim());
  const isStringType = /^(VARCHAR|CHAR|TEXT|UNIQUEIDENTIFIER)/i.test(typeStr.trim());
  if (isUnicodeStr) {
    return "N'" + strVal.replace(/'/g, "''") + "'";
  }
  if (isStringType) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  const lower = strVal.toLowerCase();
  if (lower === 'null') return 'NULL';
  if (lower === 'true') return '1';
  if (lower === 'false') return '0';
  if (/^(getdate\(\)|sysdatetime\(\)|newid\(\)|current_timestamp)/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
    return strVal;
  }
  if (!isNaN(Number(strVal))) {
    return strVal;
  }
  return "N'" + strVal.replace(/'/g, "''") + "'";
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

function buildMssqlColumnDef(f) {
  const typeStr = f.type || f.dataType || 'NVARCHAR(255)';
  const identity = f.increment ? ' IDENTITY(1,1)' : '';
  const notNull = f.not_null || f.notNull || f.pk ? ' NOT NULL' : '';
  const rawDefVal = !f.increment
    ? ((f.dbdefault !== null && f.dbdefault !== undefined && f.dbdefault !== '')
      ? f.dbdefault
      : (f.default !== undefined ? f.default : ''))
    : '';
  const formattedDef = formatSqlDefault(rawDefVal, typeStr);
  const defVal = formattedDef ? ` DEFAULT ${formattedDef}` : '';
  return `  [${f.name}] ${typeStr}${identity}${defVal}${notNull}`;
}

function extractPrimaryKeyInfo(tbl, fields = [], tableName = '') {
  let pkCols = [];
  let pkName = `PK_${tableName.toUpperCase()}`;
  const pkIndex = tbl.indexes ? tbl.indexes.find(idx => idx.pk || idx.type === 'primary') : null;
  if (pkIndex) {
    pkName = (pkIndex.name || pkName).replace(/[\[\]"`]/g, '');
    const raw = pkIndex.columns || pkIndex.fields || [];
    pkCols = raw.map(c => (typeof c === 'object' ? (c.value || c.name || '') : String(c)).replace(/[\[\]"`]/g, '').trim()).filter(Boolean);
  } else {
    pkCols = fields.filter(f => f.pk).map(f => f.name.replace(/[\[\]"`]/g, '').trim());
  }
  return { pkCols, pkName };
}

function extractIndexColumns(idx) {
  if (!idx) return [];
  return (idx.columns || idx.fields || []).map(c => {
    const colName = (typeof c === 'object' && c !== null) ? (c.name || c.value || '') : String(c || '');
    const clean = colName.replace(/[\[\]"`]/g, '').trim();
    return clean ? `[${clean}]` : null;
  }).filter(Boolean);
}

function buildMssqlFkSql(schemaName, currentTableName, fk) {
  if (!fk || !fk.toTable) return '';
  const fromTbl = (fk.fromTable || currentTableName).replace(/[\[\]"`]/g, '');
  const toTbl = fk.toTable.replace(/[\[\]"`]/g, '');
  const fromCols = (fk.fromCols || []).map(c => `[${(typeof c === 'object' ? (c.name || c.value || '') : String(c)).replace(/[\[\]"`]/g, '').trim()}]`).filter(c => c !== '[]');
  if (fromCols.length === 0) return '';
  const rawToCols = (fk.toCols && fk.toCols.length > 0) ? fk.toCols : fk.fromCols;
  const toCols = rawToCols.map(c => `[${(typeof c === 'object' ? (c.name || c.value || '') : String(c)).replace(/[\[\]"`]/g, '').trim()}]`).filter(c => c !== '[]');
  const fkName = (fk.name || `FK_${fromTbl}_${fromCols.map(c => c.replace(/[\[\]]/g, '')).join('_')}`).replace(/[\[\]"`]/g, '');
  const onDelete = fk.onDelete ? ` ON DELETE ${String(fk.onDelete).toUpperCase().trim()}` : '';
  const onUpdate = fk.onUpdate ? ` ON UPDATE ${String(fk.onUpdate).toUpperCase().trim()}` : '';
  return `ALTER TABLE [${schemaName}].[${fromTbl}] ADD CONSTRAINT [${fkName}] FOREIGN KEY (${fromCols.join(', ')}) REFERENCES [${schemaName}].[${toTbl}] (${toCols.join(', ')})${onDelete}${onUpdate};`;
}

export function generateMssqlMigrationScripts(diffResult, targetTableNames = [], dialectConfig = {}, options = {}) {
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
      const custom = newTbl.custom || {};
      const schemaName = custom.schema || 'dbo';
      const fgClause = custom.filegroup ? ` ON [${custom.filegroup}]` : '';
      const fields = newTbl.fields || newTbl.columns || [];
      const colDefs = fields.map(f => buildMssqlColumnDef(f));
      const { pkCols, pkName } = extractPrimaryKeyInfo(newTbl, fields, tableName);
      if (pkCols.length > 0) {
        colDefs.push(`  CONSTRAINT [${pkName}] PRIMARY KEY CLUSTERED (${pkCols.map(c => `[${c}]`).join(', ')})`);
      }

      scripts.push({
        filename: `01_create_table_${tblLower}.sql`,
        content: `-- 新規テーブル作成: ${tableName}\nCREATE TABLE [${schemaName}].[${tableName}] (\n${colDefs.join(',\n')}\n)${fgClause};\nGO\n`,
      });

      const idxLines = [];
      for (const idx of (newTbl.indexes || [])) {
        if (!idx.pk && idx.type !== 'primary') {
          const cols = extractIndexColumns(idx);
          if (cols.length > 0) {
            const uq = idx.unique ? 'UNIQUE ' : '';
            idxLines.push(`CREATE ${uq}NONCLUSTERED INDEX [${idx.name || `IDX_${tableName}`}] ON [${schemaName}].[${tableName}] (${cols.join(', ')});`);
          }
        }
      }
      const fkLines = [];
      for (const pair of (tableDiff.alignedFks || [])) {
        if (['ADDED', 'MODIFIED', 'UNCHANGED'].includes(pair.status) && pair.newFk) {
          const sql = buildMssqlFkSql(schemaName, tableName, pair.newFk);
          if (sql && !fkLines.includes(sql)) fkLines.push(sql);
        }
      }
      const commentLines = [];
      if (options.includeComment !== false) {
        const cs = options.commentSource || 'note';
        const tc = extractComment(newTbl, cs);
        if (tc) commentLines.push(`EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'${tc}', @level0type=N'SCHEMA', @level0name=N'${schemaName}', @level1type=N'TABLE', @level1name=N'${tableName}';`);
        for (const f of fields) {
          const cc = extractComment(f, cs);
          if (cc) commentLines.push(`EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'${cc}', @level0type=N'SCHEMA', @level0name=N'${schemaName}', @level1type=N'TABLE', @level1name=N'${tableName}', @level2type=N'COLUMN', @level2name=N'${f.name}';`);
        }
      }
      const sec = [];
      if (idxLines.length > 0) sec.push(`-- インデックス作成\n${idxLines.join('\n')}`);
      if (fkLines.length > 0) sec.push(`-- 外部キー制約付与\n${fkLines.join('\n')}`);
      if (commentLines.length > 0) sec.push(`-- コメント付与\n${commentLines.join('\n')}`);
      if (sec.length > 0) {
        scripts.push({
          filename: `02_indexes_and_comments_${tblLower}.sql`,
          content: `-- インデックス・外部キー・コメント付与: ${tableName}\n${sec.join('\n\n')}\nGO\n`,
        });
      }
    } else if (mode === 'RECREATE_TABLE') {
      const oldTbl = tableDiff.oldTable || {};
      const newTbl = tableDiff.newTable || {};
      const custom = newTbl.custom || {};
      const schemaName = custom.schema || oldTbl.custom?.schema || 'dbo';
      const fgClause = custom.filegroup ? ` ON [${custom.filegroup}]` : '';
      const oldFields = oldTbl.fields || oldTbl.columns || [];
      const newFields = newTbl.fields || newTbl.columns || [];
      const backupTableName = `${tableName}_OLD_${timestamp}`;
      const alignedFks = tableDiff.alignedFks || [];

      // Step 1: 制約・インデックス削除
      const dropLines = [];
      const droppedFks = new Set();
      for (const pair of alignedFks) {
        const fkName = (pair.oldFk?.name || '').replace(/[\[\]"`]/g, '').trim();
        if (fkName && !droppedFks.has(fkName)) {
          droppedFks.add(fkName);
          dropLines.push(`ALTER TABLE [${schemaName}].[${tableName}] DROP CONSTRAINT [${fkName}];`);
        }
      }
      for (const idx of (oldTbl.indexes || [])) {
        if (!idx.pk && idx.type !== 'primary' && idx.name) {
          dropLines.push(`DROP INDEX [${idx.name.replace(/[\[\]"`]/g, '').trim()}] ON [${schemaName}].[${tableName}];`);
        }
      }
      const { pkCols: oldPkCols, pkName: oldPkName } = extractPrimaryKeyInfo(oldTbl, oldFields, tableName);
      if (oldPkCols.length > 0 && oldPkName) {
        dropLines.push(`ALTER TABLE [${schemaName}].[${tableName}] DROP CONSTRAINT [${oldPkName}];`);
      }
      scripts.push({
        filename: `01_drop_constraints_and_indexes_${tblLower}.sql`,
        content: `-- 旧制約・インデックス削除: ${tableName}\n${dropLines.length > 0 ? dropLines.join('\n') + '\nGO\n' : '-- 削除対象なし\n'}`,
      });

      // Step 2: 退避リネーム
      scripts.push({
        filename: `02_backup_table_${tblLower}.sql`,
        content: `-- テーブル名変更（退避）: ${tableName} -> ${backupTableName}\nEXEC sp_rename N'${schemaName}.${tableName}', N'${backupTableName}';\nGO\n`,
      });

      // Step 3: 新テーブル再作成
      const colDefs = newFields.map(f => buildMssqlColumnDef(f));
      const { pkCols, pkName } = extractPrimaryKeyInfo(newTbl, newFields, tableName);
      if (pkCols.length > 0) {
        colDefs.push(`  CONSTRAINT [${pkName}] PRIMARY KEY CLUSTERED (${pkCols.map(c => `[${c}]`).join(', ')})`);
      }
      scripts.push({
        filename: `03_recreate_table_${tblLower}.sql`,
        content: `-- 新定義テーブル作成: ${tableName}\nCREATE TABLE [${schemaName}].[${tableName}] (\n${colDefs.join(',\n')}\n)${fgClause};\nGO\n`,
      });

      // Step 4: データ移行（追加カラム対応）
      const oldColNames = new Set(oldFields.map(f => f.name.toLowerCase()));
      const hasCommonCol = newFields.some(nf => oldColNames.has(nf.name.toLowerCase()));
      if (newFields.length > 0 && hasCommonCol) {
        const hasIdentity = newFields.some(nf => nf.increment);
        const identityOn = hasIdentity ? `SET IDENTITY_INSERT [${schemaName}].[${tableName}] ON;\n` : '';
        const identityOff = hasIdentity ? `\nSET IDENTITY_INSERT [${schemaName}].[${tableName}] OFF;` : '';
        const insertColsMultiline = newFields.map(nf => `    [${nf.name}]`).join(',\n');
        const selectExprsMultiline = newFields.map(nf => {
          if (oldColNames.has(nf.name.toLowerCase())) {
            return `    [${nf.name}]`;
          }
          const typeStr = nf.type || nf.dataType || '';
          const rawDefVal = (nf.dbdefault !== null && nf.dbdefault !== undefined && nf.dbdefault !== '')
            ? nf.dbdefault
            : (nf.default !== undefined ? nf.default : '');
          const formattedDef = formatSqlDefault(rawDefVal, typeStr);
          if (formattedDef) {
            return `    ${formattedDef} /* 追加カラム [${nf.name}] のデフォルト値 */`;
          }
          const notNullNote = (nf.not_null || nf.notNull || nf.pk) ? ' NOT NULL' : '';
          return `    <<値をセット>> /* 追加カラム [${nf.name}] ${typeStr}${notNullNote} */`;
        }).join(',\n');

        scripts.push({
          filename: `04_data_copy_${tblLower}.sql`,
          content: `-- 旧テーブルから新テーブルへのデータ移行: ${tableName}\nBEGIN TRANSACTION;\n${identityOn}INSERT INTO [${schemaName}].[${tableName}] (\n${insertColsMultiline}\n)\nSELECT\n${selectExprsMultiline}\nFROM [${schemaName}].[${backupTableName}];${identityOff}\nCOMMIT TRANSACTION;\nGO\n`,
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
            idxLines.push(`CREATE ${uq}NONCLUSTERED INDEX [${idx.name || `IDX_${tableName}`}] ON [${schemaName}].[${tableName}] (${cols.join(', ')});`);
          }
        }
      }
      const fkLines = [];
      for (const pair of alignedFks) {
        if (pair.newFk) {
          const sql = buildMssqlFkSql(schemaName, tableName, pair.newFk);
          if (sql && !fkLines.includes(sql)) fkLines.push(sql);
        }
      }
      const commentLines = [];
      if (options.includeComment !== false) {
        const cs = options.commentSource || 'note';
        const tc = extractComment(newTbl, cs);
        if (tc) commentLines.push(`EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'${tc}', @level0type=N'SCHEMA', @level0name=N'${schemaName}', @level1type=N'TABLE', @level1name=N'${tableName}';`);
        for (const f of newFields) {
          const cc = extractComment(f, cs);
          if (cc) commentLines.push(`EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'${cc}', @level0type=N'SCHEMA', @level0name=N'${schemaName}', @level1type=N'TABLE', @level1name=N'${tableName}', @level2type=N'COLUMN', @level2name=N'${f.name}';`);
        }
      }
      const sec = [];
      if (idxLines.length > 0) sec.push(`-- インデックス再作成\n${idxLines.join('\n')}`);
      if (fkLines.length > 0) sec.push(`-- 外部キー制約再作成\n${fkLines.join('\n')}`);
      if (commentLines.length > 0) sec.push(`-- コメント付与\n${commentLines.join('\n')}`);
      scripts.push({
        filename: `05_indexes_fk_comments_${tblLower}.sql`,
        content: `-- インデックス・外部キー・コメント再作成: ${tableName}\n${sec.length > 0 ? sec.join('\n\n') + '\nGO\n' : '-- 対象なし\n'}`,
      });

      // Step 6: バックアップ削除
      scripts.push({
        filename: `06_drop_backup_${tblLower}.sql`,
        content: `-- 退避テーブル削除（移行データ確認後に実行してください）: ${backupTableName}\nDROP TABLE IF EXISTS [${schemaName}].[${backupTableName}];\nGO\n`,
      });
    } else if (mode === 'DROP') {
      const oldTbl = tableDiff.oldTable || {};
      const schemaName = oldTbl.custom?.schema || 'dbo';
      scripts.push({
        filename: `01_drop_table_${tblLower}.sql`,
        content: `-- テーブル削除: ${tableName}\nDROP TABLE IF EXISTS [${schemaName}].[${tableName}];\nGO\n`,
      });
    }

    if (scripts.length > 0) {
      result[tableName] = scripts;
    }
  }

  return result;
}
