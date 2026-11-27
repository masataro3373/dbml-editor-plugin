// 日本語コメント: Oracle マイグレーション SQL 生成器 (plugins/oracle-dialect/migration-generator.js)
// AST 差分比較結果 (diffResult) に基づき、Oracle 固有の安全なデータ移行・再作成 SQL ファイル群を生成します。

/**
 * 日本語コメント: インデックス定義から対象カラム名（ダブルクォート付き）の配列を抽出
 * @param {Object} idx - インデックス定義オブジェクト
 * @returns {Array<string>} カラム名配列 (例: ['"COL1"', '"COL2"'])
 */
function extractIndexColumns(idx) {
  if (!idx) return [];
  const raw = idx.columns || idx.fields || [];
  return raw.map(c => {
    let colName = '';
    if (typeof c === 'object' && c !== null) {
      colName = c.name || c.value || c.column || '';
    } else {
      colName = String(c || '');
    }
    const clean = colName.replace(/["`]/g, '').trim();
    return clean ? `"${clean}"` : null;
  }).filter(Boolean);
}

/**
 * 日本語コメント: 外部キー (FK) 定義オブジェクトから Oracle 用の ADD CONSTRAINT 文を生成
 * @param {string} currentTableName - 対象テーブル名
 * @param {Object} fk - FK定義オブジェクト
 * @returns {string} ALTER TABLE ... ADD CONSTRAINT 文 (生成不可時は空文字)
 */
function buildOracleFkSql(currentTableName, fk) {
  if (!fk || !fk.toTable) return '';
  const fromTbl = (fk.fromTable || currentTableName).toUpperCase().replace(/["`]/g, '');
  const toTbl = fk.toTable.toUpperCase().replace(/["`]/g, '');

  const fromCols = (fk.fromCols || []).map(c => {
    const colName = typeof c === 'object' && c !== null ? (c.name || c.value || '') : String(c);
    return `"${colName.replace(/["`]/g, '').trim()}"`;
  }).filter(c => c !== '""');

  if (fromCols.length === 0) return '';

  const rawToCols = (fk.toCols && fk.toCols.length > 0) ? fk.toCols : fk.fromCols;
  const toCols = rawToCols.map(c => {
    const colName = typeof c === 'object' && c !== null ? (c.name || c.value || '') : String(c);
    return `"${colName.replace(/["`]/g, '').trim()}"`;
  }).filter(c => c !== '""');

  const cleanColsForName = (fk.fromCols || []).map(c => {
    const colName = typeof c === 'object' && c !== null ? (c.name || c.value || '') : String(c);
    return colName.replace(/["`]/g, '').trim();
  }).join('_');

  const fkName = (fk.name || `FK_${fromTbl}_${cleanColsForName}`).replace(/["`]/g, '');

  let onDeleteClause = '';
  if (fk.onDelete) {
    const delUpper = String(fk.onDelete).toUpperCase().trim();
    if (delUpper === 'CASCADE') {
      onDeleteClause = ' ON DELETE CASCADE';
    } else if (delUpper === 'SET NULL' || delUpper === 'SET_NULL') {
      onDeleteClause = ' ON DELETE SET NULL';
    }
  }

  return `ALTER TABLE "${fromTbl}" ADD CONSTRAINT "${fkName}" FOREIGN KEY (${fromCols.join(', ')}) REFERENCES "${toTbl}" (${toCols.join(', ')})${onDeleteClause};`;
}

/**
 * 日本語コメント: コメント文字列から <!-- custom --> 以降を除去し、シングルクォートをエスケープ
 * @param {string|Object} comment - コメント文字列または note オブジェクト
 * @returns {string} サニタイズ済みコメント文字列
 */
function cleanComment(comment) {
  if (!comment) return '';
  let txt = '';
  if (typeof comment === 'object' && comment !== null) {
    txt = comment.value || '';
  } else {
    txt = String(comment);
  }
  if (txt.includes('<!-- custom -->')) {
    txt = txt.split('<!-- custom -->')[0];
  }
  txt = txt.trim();
  if (!txt) return '';
  return txt.replace(/'/g, "''");
}

/**
 * 日本語コメント: オブジェクト（テーブルまたはカラム）から commentSource 設定に応じてサニタイズ済みコメント文字列を抽出
 * @param {Object} obj - テーブルまたはカラム定義オブジェクト
 * @param {string} commentSource - コメントソース ('note' | 'logicalName' | 'both')
 * @returns {string} サニタイズ済みコメント文字列
 */
function extractOracleComment(obj, commentSource = 'note') {
  if (!obj) return '';
  const note = cleanComment(obj.note);
  const logical = cleanComment(obj.logicalName || (obj.custom && obj.custom.logicalName));

  if (commentSource === 'logicalName') {
    return logical;
  }
  if (commentSource === 'both') {
    if (logical && note) {
      return `${logical}: ${note}`;
    }
    return logical || note || '';
  }
  // デフォルト: 'note'
  return note;
}

/**
 * 日本語コメント: テーブル定義から主キー情報（カラム配列および制約名）を抽出
 * @param {Object} tbl - テーブル定義オブジェクト
 * @param {Array} fields - カラム定義配列
 * @param {string} tableName - テーブル名
 * @returns {{ pkCols: Array<string>, pkName: string }}
 */
function extractPrimaryKeyInfo(tbl, fields = [], tableName = '') {
  let pkCols = [];
  let pkName = `PK_${tableName.toUpperCase()}`;
  const pkIndex = tbl.indexes ? tbl.indexes.find(idx => idx.pk || idx.type === 'primary') : null;
  if (pkIndex) {
    pkName = (pkIndex.name || pkName).replace(/["`]/g, '');
    const rawPkCols = pkIndex.columns || pkIndex.fields || [];
    pkCols = rawPkCols.map(c => typeof c === 'object' ? (c.value || c.name || '') : String(c))
      .map(c => c.replace(/["`]/g, '').trim())
      .filter(Boolean);
  } else {
    pkCols = fields.filter(f => f.pk).map(f => f.name.replace(/["`]/g, '').trim());
  }
  return { pkCols, pkName };
}

/**
 * 日本語コメント: テーブルの物理属性・TABLESPACE 句および一時テーブル句を生成 (ddl-template.js と共通仕様)
 * @param {Object} tbl - テーブル定義オブジェクト (newTable)
 * @param {Array} fields - カラム定義配列
 * @param {Object} options - 出力オプション ({ includeTablespace, includePctfreeInitrans })
 * @returns {string} 物理属性節 (先頭改行付き、存在しない場合は空文字)
 */
function buildTablePhysicalClauses(tbl, fields = [], options = {}) {
  const custom = tbl.custom || {};
  const includeTablespace = options.includeTablespace !== false;
  const includePctfreeInitrans = options.includePctfreeInitrans !== false;

  const tablespace = includeTablespace ? (custom.tablespace || tbl.tablespace || '') : '';
  const lobTablespace = includeTablespace ? (custom.lob_tablespace || '') : '';
  const pctfree = custom.pctfree;
  const initrans = custom.initrans;
  const logging = custom.logging;
  const isTemp = Boolean(custom.table_type);

  const clauses = [];

  if (isTemp) {
    // 日本語コメント: 一時テーブルの場合は ON COMMIT 句を出力
    clauses.push(`ON COMMIT ${custom.on_commit || 'DELETE ROWS'}`);
  } else {
    // 日本語コメント: 通常テーブルの場合は PCTFREE / INITRANS / TABLESPACE / LOGGING / LOB TABLESPACE を出力
    if (includePctfreeInitrans) {
      if (pctfree !== undefined && pctfree !== null && String(pctfree).trim() !== '') {
        clauses.push(`PCTFREE ${pctfree}`);
      }
      if (initrans !== undefined && initrans !== null && String(initrans).trim() !== '') {
        clauses.push(`INITRANS ${initrans}`);
      }
    }
    if (tablespace) {
      clauses.push(`TABLESPACE "${tablespace}"`);
    }
    if (logging !== undefined && logging !== null) {
      if (typeof logging === 'boolean') {
        clauses.push(logging ? 'LOGGING' : 'NOLOGGING');
      } else if (String(logging).trim() !== '') {
        clauses.push(String(logging).toUpperCase().trim());
      }
    }
    const lobFields = fields.filter(f => {
      const typeStr = (f.type || f.dataType || '').toString().trim();
      return /^(CLOB|BLOB|NCLOB|BFILE)/i.test(typeStr);
    });
    if (lobFields.length > 0 && lobTablespace) {
      clauses.push(`LOB (${lobFields.map(f => `"${f.name}"`).join(', ')}) STORE AS (TABLESPACE "${lobTablespace}")`);
    }
  }

  return clauses.length > 0 ? ('\n' + clauses.join('\n')) : '';
}

/**
 * 日本語コメント: Oracle 向けに DEFAULT 値をデータ型に応じてフォーマット (ddl-template.js と共通仕様)
 * @param {string|number|boolean|Object|null|undefined} val - デフォルト値 (dbdefault または default)
 * @param {string|Object} dataType - カラムのデータ型
 * @returns {string} フォーマット済みデフォルト値 (未指定時は空文字)
 */
function formatSqlDefault(val, dataType) {
  if (val === undefined || val === null) return '';
  const raw = (typeof val === 'object' && val !== null && 'value' in val) ? val.value : val;
  if (raw === undefined || raw === null || String(raw).trim() === '') return '';

  const strVal = String(raw).trim();
  if (strVal.startsWith("'") && strVal.endsWith("'")) {
    return strVal;
  }

  const typeStr = typeof dataType === 'string' ? dataType : (dataType ? (dataType.type_name || '') : '');
  const isStringType = /^(VARCHAR|VARCHAR2|CHAR|NVARCHAR|NVARCHAR2|TEXT|CLOB|STRING)/i.test(typeStr.trim());
  if (isStringType) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  if (!isNaN(Number(strVal))) {
    return strVal;
  }
  const isFunctionOrKeyword = /^(sysdate|current_timestamp|now\(\)|null|true|false|sequence\.nextval)/i.test(strVal) || strVal.endsWith(')') || strVal.startsWith('(');
  if (isFunctionOrKeyword) {
    return strVal;
  }
  return "'" + strVal.replace(/'/g, "''") + "'";
}

/**
 * 日本語コメント: カラム定義オブジェクトから Oracle の CREATE TABLE 用カラム定義行を生成
 * @param {Object} f - カラム定義オブジェクト
 * @returns {string} カラム定義行
 */
function buildOracleColumnDef(f) {
  const typeStr = f.type || f.dataType || 'VARCHAR2(100)';
  const notNull = f.not_null || f.notNull || f.pk ? ' NOT NULL' : '';
  const rawDefVal = (f.dbdefault !== null && f.dbdefault !== undefined && f.dbdefault !== '')
    ? f.dbdefault
    : (f.default !== undefined ? f.default : '');
  const formattedDef = formatSqlDefault(rawDefVal, typeStr);
  const defVal = formattedDef ? ` DEFAULT ${formattedDef}` : '';
  return `  "${f.name}" ${typeStr}${defVal}${notNull}`;
}

/**
 * 日本語コメント: インデックスの TABLESPACE 句を生成
 * @param {Object} idx - インデックス定義オブジェクト
 * @param {boolean} isTemp - 一時テーブルフラグ
 * @param {string} indexTablespace - テーブル指定のインデックス表領域
 * @param {Object} options - 出力オプション ({ includeTablespace })
 * @returns {string} TABLESPACE 句 (例: ' TABLESPACE "IDX_TS"' または空文字)
 */
function buildIndexTablespaceClause(idx, isTemp, indexTablespace, options = {}) {
  if (options.includeTablespace === false || isTemp) {
    return '';
  }
  const ts = (idx && idx.tablespace) ? idx.tablespace : indexTablespace;
  return ts ? ` TABLESPACE "${ts}"` : '';
}

/**
 * 差分結果から Oracle 向けマイグレーション SQL スクリプト群を生成
 * @param {Object} diffResult - schema-diff.js の出力結果
 * @param {Array<string>} targetTableNames - 選択されたテーブル名一覧
 * @param {Object} dialectConfig - 方言設定
 * @param {Object} options - { includeComment, commentSource, includeTablespace, includePctfreeInitrans, targetDbms }
 * @returns {Object} { [tableName]: [{ filename, content }] }
 */
export function generateOracleMigrationScripts(diffResult, targetTableNames = [], dialectConfig = {}, options = {}) {
  const result = {};
  if (!diffResult || !Array.isArray(diffResult.tables)) {
    return result;
  }

  const targetSet = new Set(targetTableNames.map(n => n.toUpperCase()));
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

  for (const tableDiff of diffResult.tables) {
    const tableName = (tableDiff.name || '').toUpperCase();
    if (targetTableNames.length > 0 && !targetSet.has(tableName)) {
      continue;
    }

    const scripts = [];
    const mode = tableDiff.migrationMode || tableDiff.status;

    if (mode === 'CREATE' || mode === 'ADD') {
      // 1. 新規テーブル作成 (CREATE / ADD)
      const newTbl = tableDiff.newTable || {};
      const custom = newTbl.custom || {};
      const indexTablespace = custom.index_tablespace || newTbl.indexTablespace || '';
      const isTemp = Boolean(custom.table_type);
      const tableTypeKw = custom.table_type ? `${custom.table_type} ` : '';

      const fields = newTbl.fields || newTbl.columns || [];
      const colDefs = fields.map(f => buildOracleColumnDef(f));

      // 日本語コメント: PK制約のインライン生成
      const { pkCols, pkName } = extractPrimaryKeyInfo(newTbl, fields, tableName);
      const includeTablespace = options.includeTablespace !== false;
      const usingIdxTs = (!isTemp && includeTablespace && indexTablespace) ? ` USING INDEX TABLESPACE "${indexTablespace}"` : '';

      const tableBodyLines = [...colDefs];
      if (pkCols.length > 0) {
        tableBodyLines.push(`  CONSTRAINT "${pkName}" PRIMARY KEY (${pkCols.map(c => `"${c}"`).join(', ')})${usingIdxTs}`);
      }

      // 日本語コメント: 物理属性（PCTFREE, INITRANS, TABLESPACE, LOGGING, LOB句）または一時テーブル句の生成
      const physicalClauses = buildTablePhysicalClauses(newTbl, fields, options);

      scripts.push({
        filename: `01_create_table_${tableName.toLowerCase()}.sql`,
        content: `-- 新規テーブル作成: ${tableName}\nCREATE ${tableTypeKw}TABLE "${tableName}" (\n${tableBodyLines.join(',\n')}\n)${physicalClauses};\n`,
      });

      // 2. PK以外のインデックス・外部キー制約・コメント付与（02_indexes_and_comments_${tbl}.sql）
      const idxLines = [];
      for (const idx of (newTbl.indexes || [])) {
        if (!idx.pk && idx.type !== 'primary') {
          const cols = extractIndexColumns(idx);
          if (cols.length > 0) {
            const uq = idx.unique ? 'UNIQUE ' : '';
            // 日本語コメント: インデックス固有またはテーブル指定のインデックス表領域を付与
            const tsClause = buildIndexTablespaceClause(idx, isTemp, indexTablespace, options);
            idxLines.push(`CREATE ${uq}INDEX "${idx.name || `IDX_${tableName}`}" ON "${tableName}" (${cols.join(', ')})${tsClause};`);
          }
        }
      }

      // 外部キー制約の出力 (alignedFks の ADDED / MODIFIED / UNCHANGED)
      const fkLines = [];
      const alignedFks = tableDiff.alignedFks || [];
      for (const pair of alignedFks) {
        if (['ADDED', 'MODIFIED', 'UNCHANGED'].includes(pair.status) && pair.newFk) {
          const fkSql = buildOracleFkSql(tableName, pair.newFk);
          if (fkSql && !fkLines.includes(fkSql)) {
            fkLines.push(fkSql);
          }
        }
      }
      // alignedFks が空でも newTbl.fks が存在する場合のフォールバック
      if (fkLines.length === 0 && Array.isArray(newTbl.fks)) {
        for (const fk of newTbl.fks) {
          const fkSql = buildOracleFkSql(tableName, fk);
          if (fkSql && !fkLines.includes(fkSql)) {
            fkLines.push(fkSql);
          }
        }
      }

      // コメント付与
      const commentLines = [];
      if (options.includeComment !== false) {
        const commentSource = options.commentSource || 'note';
        const tblComment = extractOracleComment(newTbl, commentSource);
        if (tblComment) {
          commentLines.push(`COMMENT ON TABLE "${tableName}" IS '${tblComment}';`);
        }
        for (const f of fields) {
          const colComment = extractOracleComment(f, commentSource);
          if (colComment) {
            commentLines.push(`COMMENT ON COLUMN "${tableName}"."${f.name}" IS '${colComment}';`);
          }
        }
      }

      const secondFileSections = [];
      if (idxLines.length > 0) {
        secondFileSections.push(`-- インデックス作成\n${idxLines.join('\n')}`);
      }
      if (fkLines.length > 0) {
        secondFileSections.push(`-- 外部キー制約付与\n${fkLines.join('\n')}`);
      }
      if (commentLines.length > 0) {
        secondFileSections.push(`-- コメント付与\n${commentLines.join('\n')}`);
      }

      if (secondFileSections.length > 0) {
        scripts.push({
          filename: `02_indexes_and_comments_${tableName.toLowerCase()}.sql`,
          content: `-- インデックス・外部キー・コメント付与: ${tableName}\n${secondFileSections.join('\n\n')}\n`,
        });
      }

    } else if (mode === 'RECREATE_TABLE') {
      // 日本語コメント: 再作成モード (安全な退避・移行・6ステップ構成)
      const oldTbl = tableDiff.oldTable || {};
      const newTbl = tableDiff.newTable || {};
      const custom = newTbl.custom || {};
      const indexTablespace = custom.index_tablespace || newTbl.indexTablespace || '';
      const isTemp = Boolean(custom.table_type);
      const tableTypeKw = custom.table_type ? `${custom.table_type} ` : '';

      const oldFields = oldTbl.fields || oldTbl.columns || [];
      const newFields = newTbl.fields || newTbl.columns || [];
      const backupTableName = `${tableName}_OLD_${timestamp}`;
      const alignedFks = tableDiff.alignedFks || [];

      // =========================================================================
      // Step 1: 01_drop_constraints_and_indexes_${tbl}.sql
      // 旧テーブルの外部キー制約、非PKインデックス、主キー制約を削除
      // =========================================================================
      const dropFkLines = [];
      const droppedFkNames = new Set();

      // 1.1 旧テーブルに紐づく既存FK制約の抽出と削除文生成 (alignedFks の oldFk および oldTbl.fks から抽出、重複排除)
      for (const pair of alignedFks) {
        const oldFk = pair.oldFk;
        const fkName = (oldFk?.name || pair.name || '').replace(/["`]/g, '').trim();
        if (fkName && !droppedFkNames.has(fkName)) {
          droppedFkNames.add(fkName);
          dropFkLines.push(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${fkName}";`);
        }
      }
      if (Array.isArray(oldTbl.fks)) {
        for (const fk of oldTbl.fks) {
          const fkName = (fk.name || '').replace(/["`]/g, '').trim();
          if (fkName && !droppedFkNames.has(fkName)) {
            droppedFkNames.add(fkName);
            dropFkLines.push(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${fkName}";`);
          }
        }
      }

      // 1.2 旧テーブルの非PKインデックスの抽出と削除文生成 (oldTbl.indexes)
      const dropIdxLines = [];
      const droppedIdxNames = new Set();
      for (const idx of (oldTbl.indexes || [])) {
        if (!idx.pk && idx.type !== 'primary') {
          const idxName = (idx.name || '').replace(/["`]/g, '').trim();
          if (idxName && !droppedIdxNames.has(idxName)) {
            droppedIdxNames.add(idxName);
            dropIdxLines.push(`DROP INDEX "${idxName}";`);
          }
        }
      }

      // 1.3 旧テーブルの主キー制約の抽出と削除文生成 (extractPrimaryKeyInfo による抽出)
      const dropPkLines = [];
      const { pkCols: oldPkCols, pkName: oldPkName } = extractPrimaryKeyInfo(oldTbl, oldFields, tableName);
      if (oldPkCols.length > 0 && oldPkName) {
        dropPkLines.push(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${oldPkName}";`);
      }

      const dropSections = [];
      if (dropFkLines.length > 0) {
        dropSections.push(`-- 既存外部キー制約の削除\n${dropFkLines.join('\n')}`);
      }
      if (dropIdxLines.length > 0) {
        dropSections.push(`-- 既存インデックスの削除\n${dropIdxLines.join('\n')}`);
      }
      if (dropPkLines.length > 0) {
        dropSections.push(`-- 既存主キー制約の削除\n${dropPkLines.join('\n')}`);
      }

      let step1Content = `-- 既存制約・インデックス削除: ${tableName}\n`;
      if (dropSections.length > 0) {
        step1Content += `${dropSections.join('\n\n')}\n`;
      } else {
        step1Content += `-- 削除対象の制約およびインデックスはありません\n`;
      }

      scripts.push({
        filename: `01_drop_constraints_and_indexes_${tableName.toLowerCase()}.sql`,
        content: step1Content,
      });

      // =========================================================================
      // Step 2: 02_backup_table_${tbl}.sql
      // 旧テーブルの退避リネーム
      // =========================================================================
      scripts.push({
        filename: `02_backup_table_${tableName.toLowerCase()}.sql`,
        content: `-- テーブル名変更（退避）: ${tableName} -> ${backupTableName}\nALTER TABLE "${tableName}" RENAME TO "${backupTableName}";\n`,
      });

      // =========================================================================
      // Step 3: 03_recreate_table_${tbl}.sql
      // 新規テーブル作成（PK制約をインライン内包 ＋ 物理属性・表領域）
      // =========================================================================
      const colDefs = newFields.map(f => buildOracleColumnDef(f));

      // 日本語コメント: PK制約のインライン生成
      const { pkCols, pkName } = extractPrimaryKeyInfo(newTbl, newFields, tableName);
      const includeTablespace = options.includeTablespace !== false;
      const usingIdxTs = (!isTemp && includeTablespace && indexTablespace) ? ` USING INDEX TABLESPACE "${indexTablespace}"` : '';

      const tableBodyLines = [...colDefs];
      if (pkCols.length > 0) {
        tableBodyLines.push(`  CONSTRAINT "${pkName}" PRIMARY KEY (${pkCols.map(c => `"${c}"`).join(', ')})${usingIdxTs}`);
      }

      // 日本語コメント: 物理属性（PCTFREE, INITRANS, TABLESPACE, LOGGING, LOB句）または一時テーブル句の生成
      const physicalClauses = buildTablePhysicalClauses(newTbl, newFields, options);

      scripts.push({
        filename: `03_recreate_table_${tableName.toLowerCase()}.sql`,
        content: `-- 新定義テーブル作成: ${tableName}\nCREATE ${tableTypeKw}TABLE "${tableName}" (\n${tableBodyLines.join(',\n')}\n)${physicalClauses};\n`,
      });

      // =========================================================================
      // Step 4: 04_data_copy_${tbl}.sql
      // データ移行 (新テーブルの全カラムを対象とし、追加カラムにはデフォルト値または <<値をセット>> を出力)
      // =========================================================================
      const oldColNames = new Set(oldFields.map(f => f.name.toUpperCase()));
      const hasCommonCol = newFields.some(nf => oldColNames.has(nf.name.toUpperCase()));

      if (newFields.length > 0 && hasCommonCol) {
        // 日本語コメント: 手直ししやすいよう 1 カラムごとの縦並び形式で出力
        const insertColsMultiline = newFields.map(nf => `    "${nf.name}"`).join(',\n');
        const selectExprsMultiline = newFields.map(nf => {
          if (oldColNames.has(nf.name.toUpperCase())) {
            return `    "${nf.name}"`;
          }
          // 日本語コメント: 追加カラムはデフォルト値があればその値、なければそのまま実行するとエラーになるプレースホルダーを出力
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
          filename: `04_data_copy_${tableName.toLowerCase()}.sql`,
          content: `-- 旧テーブルから新テーブルへのデータ移行: ${tableName}\nINSERT INTO "${tableName}" (\n${insertColsMultiline}\n)\nSELECT\n${selectExprsMultiline}\nFROM "${backupTableName}";\nCOMMIT;\n`,
        });
      } else {
        scripts.push({
          filename: `04_data_copy_${tableName.toLowerCase()}.sql`,
          content: `-- 旧テーブルから新テーブルへのデータ移行: ${tableName}\n-- 移行対象となる共通カラムが存在しません\n`,
        });
      }

      // =========================================================================
      // Step 5: 05_indexes_fk_comments_${tbl}.sql
      // 全非PKインデックス再作成 ＋ 外部キー制約再作成 ＋ コメント付与
      // =========================================================================
      const idxLines = [];
      for (const idx of (newTbl.indexes || [])) {
        if (!idx.pk && idx.type !== 'primary') {
          const cols = extractIndexColumns(idx);
          if (cols.length > 0) {
            const uq = idx.unique ? 'UNIQUE ' : '';
            // 日本語コメント: インデックス固有またはテーブル指定のインデックス表領域を付与
            const tsClause = buildIndexTablespaceClause(idx, isTemp, indexTablespace, options);
            idxLines.push(`CREATE ${uq}INDEX "${idx.name || `IDX_${tableName}`}" ON "${tableName}" (${cols.join(', ')})${tsClause};`);
          }
        }
      }

      // 日本語コメント: 新テーブル側の外部キー制約再作成 (alignedFks の newFk および newTbl.fks フォールバック、重複排除)
      const newFkLines = [];
      const addedFkSignatures = new Set();
      for (const pair of alignedFks) {
        if (pair.newFk) {
          const fkSql = buildOracleFkSql(tableName, pair.newFk);
          if (fkSql && !addedFkSignatures.has(fkSql)) {
            addedFkSignatures.add(fkSql);
            newFkLines.push(fkSql);
          }
        }
      }
      if (Array.isArray(newTbl.fks)) {
        for (const fk of newTbl.fks) {
          const fkSql = buildOracleFkSql(tableName, fk);
          if (fkSql && !addedFkSignatures.has(fkSql)) {
            addedFkSignatures.add(fkSql);
            newFkLines.push(fkSql);
          }
        }
      }

      // 日本語コメント: コメント付与
      const commentLines = [];
      if (options.includeComment !== false) {
        const commentSource = options.commentSource || 'note';
        const tblComment = extractOracleComment(newTbl, commentSource);
        if (tblComment) {
          commentLines.push(`COMMENT ON TABLE "${tableName}" IS '${tblComment}';`);
        }
        for (const f of newFields) {
          const colComment = extractOracleComment(f, commentSource);
          if (colComment) {
            commentLines.push(`COMMENT ON COLUMN "${tableName}"."${f.name}" IS '${colComment}';`);
          }
        }
      }

      const step5Sections = [];
      if (idxLines.length > 0) {
        step5Sections.push(`-- インデックス再作成\n${idxLines.join('\n')}`);
      }
      if (newFkLines.length > 0) {
        step5Sections.push(`-- 外部キー制約再作成\n${newFkLines.join('\n')}`);
      }
      if (commentLines.length > 0) {
        step5Sections.push(`-- コメント付与\n${commentLines.join('\n')}`);
      }

      let step5Content = `-- インデックス・外部キー・コメント再作成: ${tableName}\n`;
      if (step5Sections.length > 0) {
        step5Content += `${step5Sections.join('\n\n')}\n`;
      } else {
        step5Content += `-- 再作成対象のインデックス、外部キー、コメントはありません\n`;
      }

      scripts.push({
        filename: `05_indexes_fk_comments_${tableName.toLowerCase()}.sql`,
        content: step5Content,
      });

      // =========================================================================
      // Step 6: 06_drop_backup_table_${tbl}.sql
      // 移行前（退避）テーブルの削除
      // =========================================================================
      scripts.push({
        filename: `06_drop_backup_table_${tableName.toLowerCase()}.sql`,
        content: `-- 移行前（退避）テーブルの削除: ${backupTableName}\nDROP TABLE "${backupTableName}" CASCADE CONSTRAINTS;\n`,
      });

    } else if (mode === 'INDEX_ONLY') {
      // インデックス変更のみ
      const idxLines = [];
      const alignedIndexes = tableDiff.alignedIndexes || [];
      const newTbl = tableDiff.newTable || {};
      const custom = newTbl.custom || {};
      const indexTablespace = custom.index_tablespace || newTbl.indexTablespace || '';
      const isTemp = Boolean(custom.table_type);
      const includeTablespace = options.includeTablespace !== false;

      for (const item of alignedIndexes) {
        const { status, oldIdx, newIdx } = item;
        if (status === 'DROPPED' && oldIdx) {
          if (oldIdx.pk) {
            idxLines.push(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${oldIdx.name || `PK_${tableName}`}";`);
          } else {
            const idxName = oldIdx.name || item.name;
            if (idxName) {
              idxLines.push(`DROP INDEX "${idxName}";`);
            }
          }
        } else if (status === 'ADDED' && newIdx) {
          const cols = extractIndexColumns(newIdx);
          if (cols.length > 0) {
            if (newIdx.pk) {
              // 日本語コメント: 一時テーブルでなく、かつインデックス表領域が指定されている場合は USING INDEX TABLESPACE を付与
              const usingIndexTs = (!isTemp && includeTablespace && indexTablespace) ? ` USING INDEX TABLESPACE "${indexTablespace}"` : '';
              idxLines.push(`ALTER TABLE "${tableName}" ADD CONSTRAINT "${newIdx.name || `PK_${tableName}`}" PRIMARY KEY (${cols.join(', ')})${usingIndexTs};`);
            } else {
              const uq = newIdx.unique ? 'UNIQUE ' : '';
              // 日本語コメント: インデックス固有またはテーブル指定のインデックス表領域を付与
              const tsClause = buildIndexTablespaceClause(newIdx, isTemp, indexTablespace, options);
              idxLines.push(`CREATE ${uq}INDEX "${newIdx.name || `IDX_${tableName}`}" ON "${tableName}" (${cols.join(', ')})${tsClause};`);
            }
          }
        } else if (status === 'MODIFIED') {
          // 変更時は旧インデックスをDROPしてから新規CREATE
          if (oldIdx) {
            if (oldIdx.pk) {
              idxLines.push(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${oldIdx.name || `PK_${tableName}`}";`);
            } else {
              const oldName = oldIdx.name || item.name;
              if (oldName) {
                idxLines.push(`DROP INDEX "${oldName}";`);
              }
            }
          }
          if (newIdx) {
            const cols = extractIndexColumns(newIdx);
            if (cols.length > 0) {
              if (newIdx.pk) {
                // 日本語コメント: 一時テーブルでなく、かつインデックス表領域が指定されている場合は USING INDEX TABLESPACE を付与
                const usingIndexTs = (!isTemp && includeTablespace && indexTablespace) ? ` USING INDEX TABLESPACE "${indexTablespace}"` : '';
                idxLines.push(`ALTER TABLE "${tableName}" ADD CONSTRAINT "${newIdx.name || `PK_${tableName}`}" PRIMARY KEY (${cols.join(', ')})${usingIndexTs};`);
              } else {
                const uq = newIdx.unique ? 'UNIQUE ' : '';
                // 日本語コメント: インデックス固有またはテーブル指定のインデックス表領域を付与
                const tsClause = buildIndexTablespaceClause(newIdx, isTemp, indexTablespace, options);
                idxLines.push(`CREATE ${uq}INDEX "${newIdx.name || `IDX_${tableName}`}" ON "${tableName}" (${cols.join(', ')})${tsClause};`);
              }
            }
          }
        }
      }

      if (idxLines.length > 0) {
        scripts.push({
          filename: `01_indexes_${tableName.toLowerCase()}.sql`,
          content: `-- インデックス変更: ${tableName}\n${idxLines.join('\n')}\n`,
        });
      }

    } else if (mode === 'FK_ONLY') {
      // 外部キー制約変更のみ
      const fkLines = [];
      const alignedFks = tableDiff.alignedFks || [];

      for (const pair of alignedFks) {
        const { status, oldFk, newFk, name } = pair;
        if (status === 'DROPPED' && oldFk) {
          const fkName = (oldFk.name || name).replace(/["`]/g, '');
          if (fkName) {
            fkLines.push(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${fkName}";`);
          }
        } else if (status === 'ADDED' && newFk) {
          const fkSql = buildOracleFkSql(tableName, newFk);
          if (fkSql) fkLines.push(fkSql);
        } else if (status === 'MODIFIED') {
          // 変更時は旧FKをDROPしてから新FKをADD
          const oldFkName = (oldFk?.name || name).replace(/["`]/g, '');
          if (oldFkName) {
            fkLines.push(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${oldFkName}";`);
          }
          if (newFk) {
            const fkSql = buildOracleFkSql(tableName, newFk);
            if (fkSql) fkLines.push(fkSql);
          }
        }
      }

      if (fkLines.length > 0) {
        scripts.push({
          filename: `01_foreign_keys_${tableName.toLowerCase()}.sql`,
          content: `-- 外部キー制約変更: ${tableName}\n${fkLines.join('\n')}\n`,
        });
      }

    } else if (mode === 'ATTR_ONLY') {
      // 属性・コメント変更のみ
      const commentLines = [];
      const newTbl = tableDiff.newTable || {};
      const commentSource = options.commentSource || 'note';

      if (options.includeComment !== false) {
        const tblComment = extractOracleComment(newTbl, commentSource);
        if (tblComment) {
          commentLines.push(`COMMENT ON TABLE "${tableName}" IS '${tblComment}';`);
        } else {
          // コメントが削除された場合
          const alignedAttributes = tableDiff.alignedAttributes || [];
          const noteAttr = alignedAttributes.find(a => a.key === 'note');
          const logicalNameAttr = alignedAttributes.find(a => a.key === 'logicalName');
          if (noteAttr?.status === 'DROPPED' || logicalNameAttr?.status === 'DROPPED') {
            commentLines.push(`COMMENT ON TABLE "${tableName}" IS '';`);
          }
        }
      }

      if (commentLines.length > 0) {
        scripts.push({
          filename: `01_comments_${tableName.toLowerCase()}.sql`,
          content: `-- テーブル属性・コメント変更: ${tableName}\n${commentLines.join('\n')}\n`,
        });
      }

    } else if (mode === 'DROP') {
      // テーブル削除
      scripts.push({
        filename: `01_drop_table_${tableName.toLowerCase()}.sql`,
        content: `-- テーブル削除: ${tableName}\nDROP TABLE "${tableName}" CASCADE CONSTRAINTS;\n`,
      });

    } else {
      // 通常の ALTER INPLACE 等
      const alterLines = [];
      for (const colDiff of (tableDiff.columnsDiff || [])) {
        if (colDiff.status === 'ADDED') {
          const f = colDiff.newColumn;
          const typeStr = f.type || f.dataType || 'VARCHAR2(100)';
          const notNull = f.notNull ? ' NOT NULL' : '';
          alterLines.push(`ALTER TABLE "${tableName}" ADD ("${f.name}" ${typeStr}${notNull});`);
        } else if (colDiff.status === 'DROPPED') {
          alterLines.push(`ALTER TABLE "${tableName}" DROP COLUMN "${colDiff.oldColumn.name}";`);
        } else if (colDiff.status === 'MODIFIED') {
          const f = colDiff.newColumn;
          const typeStr = f.type || f.dataType || 'VARCHAR2(100)';
          alterLines.push(`ALTER TABLE "${tableName}" MODIFY ("${f.name}" ${typeStr});`);
        }
      }

      if (alterLines.length > 0) {
        scripts.push({
          filename: `01_alter_table_${tableName.toLowerCase()}.sql`,
          content: `-- カラム定義変更: ${tableName}\n${alterLines.join('\n')}\n`,
        });
      }

      // 差分内にインデックス変更が存在する場合の追従
      const idxLines = [];
      const newTbl = tableDiff.newTable || {};
      const custom = newTbl.custom || {};
      const indexTablespace = custom.index_tablespace || newTbl.indexTablespace || '';
      const isTemp = Boolean(custom.table_type);
      const includeTablespace = options.includeTablespace !== false;

      for (const item of (tableDiff.alignedIndexes || [])) {
        if (item.status === 'DROPPED' && item.oldIdx) {
          const idxName = item.oldIdx.name || item.name;
          if (idxName) idxLines.push(`DROP INDEX "${idxName}";`);
        } else if (item.status === 'ADDED' && item.newIdx) {
          const cols = extractIndexColumns(item.newIdx);
          if (cols.length > 0) {
            if (item.newIdx.pk) {
              // 日本語コメント: 一時テーブルでなく、かつインデックス表領域が指定されている場合は USING INDEX TABLESPACE を付与
              const usingIndexTs = (!isTemp && includeTablespace && indexTablespace) ? ` USING INDEX TABLESPACE "${indexTablespace}"` : '';
              idxLines.push(`ALTER TABLE "${tableName}" ADD CONSTRAINT "${item.newIdx.name || `PK_${tableName}`}" PRIMARY KEY (${cols.join(', ')})${usingIndexTs};`);
            } else {
              const uq = item.newIdx.unique ? 'UNIQUE ' : '';
              // 日本語コメント: インデックス固有またはテーブル指定のインデックス表領域を付与
              const tsClause = buildIndexTablespaceClause(item.newIdx, isTemp, indexTablespace, options);
              idxLines.push(`CREATE ${uq}INDEX "${item.newIdx.name || `IDX_${tableName}`}" ON "${tableName}" (${cols.join(', ')})${tsClause};`);
            }
          }
        }
      }
      if (idxLines.length > 0) {
        scripts.push({
          filename: `02_indexes_${tableName.toLowerCase()}.sql`,
          content: `-- インデックス変更: ${tableName}\n${idxLines.join('\n')}\n`,
        });
      }

      // 差分内に外部キー変更が存在する場合の追従
      const fkLines = [];
      for (const pair of (tableDiff.alignedFks || [])) {
        if (pair.status === 'DROPPED' && pair.oldFk) {
          const fkName = (pair.oldFk.name || pair.name).replace(/["`]/g, '');
          if (fkName) fkLines.push(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${fkName}";`);
        } else if (pair.status === 'ADDED' && pair.newFk) {
          const fkSql = buildOracleFkSql(tableName, pair.newFk);
          if (fkSql) fkLines.push(fkSql);
        }
      }
      if (fkLines.length > 0) {
        scripts.push({
          filename: `03_foreign_keys_${tableName.toLowerCase()}.sql`,
          content: `-- 外部キー制約変更: ${tableName}\n${fkLines.join('\n')}\n`,
        });
      }
    }

    result[tableName] = scripts;
  }

  return result;
}
