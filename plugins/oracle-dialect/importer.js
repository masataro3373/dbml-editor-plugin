// 日本語コメント: Oracle DDL インポーター実装 (plugins/oracle-dialect/importer.js)
// context.api.BaseImporter を継承し、前処理 (DDLクレンジング・物理属性/COMMENT抽出) → 本処理 (@dbml/core API経由) → 後処理 (Metadataブロック付与・Project定義補完) を行います。

function escapeDbmlInlineString(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r\n|\r|\n/g, '\\n');
}

function escapeDbmlBlockString(str) {
  if (!str) return '';
  return str
    .replace(/'''/g, "\\'\\'\\'")
    .replace(/\r\n|\r/g, '\n');
}

function cleanIdentifier(identifierStr) {
  if (!identifierStr) return '';
  let str = identifierStr.trim();
  if (str.includes('.')) {
    const parts = str.split('.');
    str = parts[parts.length - 1];
  }
  return str.replace(/^["']|["']$/g, '').trim();
}

function formatMetadataValue(val) {
  if (typeof val === 'boolean' || typeof val === 'number') {
    return String(val);
  }
  const str = String(val ?? '');
  return `'${escapeDbmlInlineString(str)}'`;
}

function preprocessOracleDdl(rawSql) {
  let sql = rawSql;

  sql = sql.replace(/^SQL>.*$/gm, '');
  sql = sql.replace(/^.*DBMS_METADATA\.GET_DDL.*$/gm, '');
  sql = sql.replace(/^--.*$/gm, '');
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, '');

  sql = sql.replace(/\bUSING\s+INDEX\s*\(\s*CREATE\s+[\s\S]*?\)\s*(?=(?:ENABLE|DISABLE|NOVALIDATE|VALIDATE|RELY|\)|,|;))/gi, '');
  sql = sql.replace(/\bUSING\s+INDEX\b[^;)]*/gi, '');
  sql = sql.replace(/\b(ENABLE|DISABLE)\s+(NOVALIDATE|VALIDATE)\b/gi, '');
  sql = sql.replace(/\b(ENABLE|DISABLE|NOVALIDATE|VALIDATE|RELY)\b(?=\s*(?:,|\)|\n\s*\)|;))/gi, '');

  sql = sql.replace(/ALTER\s+TABLE\s+([^\s;]+)\s+ADD\s*\(\s*(CONSTRAINT\b[\s\S]*?)\s*\)\s*;/gi, 'ALTER TABLE $1 ADD $2;');
  sql = sql.replace(/ALTER\s+TABLE\s+([^\s;]+)\s+ADD\s*\(\s*(PRIMARY\s+KEY\b[\s\S]*?)\s*\)\s*;/gi, 'ALTER TABLE $1 ADD $2;');
  sql = sql.replace(/ALTER\s+TABLE\s+([^\s;]+)\s+ADD\s*\(\s*(UNIQUE\b[\s\S]*?)\s*\)\s*;/gi, 'ALTER TABLE $1 ADD $2;');
  sql = sql.replace(/ALTER\s+TABLE\s+([^\s;]+)\s+ADD\s*\(\s*(FOREIGN\s+KEY\b[\s\S]*?)\s*\)\s*;/gi, 'ALTER TABLE $1 ADD $2;');

  sql = sql.replace(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+["\w$]*SYS_IL[\w$]*\s+ON\s+[\s\S]*?;/gi, '');
  sql = sql.replace(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+["\w$]+\s+ON\s+["\w$]+(?:\.["\w$]+)?\s*\(\s*PCTFREE[\s\S]*?\);?/gi, '');
  sql = sql.replace(/SEGMENT\s+CREATION\s+(?:IMMEDIATE|DEFERRED)/gi, '');
  sql = sql.replace(/\s*LOB\s*\([^\)]+\)\s*STORE\s+AS\s+[\s\S]*?;/gi, ' ;');
  // 日本語コメント: ON COMMIT (PRESERVE|DELETE) ROWS 句を保持しつつ、TABLESPACEやPCTFREE、COMPUTE STATISTICSなどの物理句を安全に除去
  sql = sql.replace(/\)\s*(?:TABLESPACE\s+["']?[a-zA-Z0-9_#$]+["']?|PCTFREE\s+\d+|PCTUSED\s+\d+|INITRANS\s+\d+|MAXTRANS\s+\d+|STORAGE\s*\([\s\S]*?\)|COMPUTE\s+STATISTICS|NOPARALLEL|PARALLEL(?:\s+\d+)?|NOSORT|REVERSE|VISIBLE|INVISIBLE|LOGGING|NOLOGGING|COMPRESS|NOCOMPRESS|\s+)*(ON\s+COMMIT\s+(?:DELETE|PRESERVE)\s+ROWS)?\s*(?:TABLESPACE\s+["']?[a-zA-Z0-9_#$]+["']?|PCTFREE\s+\d+|PCTUSED\s+\d+|INITRANS\s+\d+|MAXTRANS\s+\d+|STORAGE\s*\([\s\S]*?\)|COMPUTE\s+STATISTICS|NOPARALLEL|PARALLEL(?:\s+\d+)?|NOSORT|REVERSE|VISIBLE|INVISIBLE|LOGGING|NOLOGGING|COMPRESS|NOCOMPRESS|\s+)*(?=;)/gi, (m, onCommit) => onCommit ? `) ${onCommit.trim()}` : ')');
  sql = sql.replace(/\bVARCHAR2\s*\(\s*(\d+)\s*(?:BYTE|CHAR)\s*\)/gi, 'VARCHAR2($1)');
  sql = sql.replace(/\bCHAR\s*\(\s*(\d+)\s*(?:BYTE|CHAR)\s*\)/gi, 'CHAR($1)');
  sql = sql.replace(/ALTER\s+TABLE\s+[^\s;]+\s+(?:MODIFY|DROP|ALLOCATE|DEALLOCATE|TRUNCATE)\b[\s\S]*?;/gi, '');
  sql = sql.replace(/COMMENT\s+ON\s+TABLE[\s\S]*?;/gi, '');
  sql = sql.replace(/COMMENT\s+ON\s+COLUMN[\s\S]*?;/gi, '');

  sql = sql.replace(/(\bCREATE\s+(?:(?:GLOBAL|PRIVATE)\s+TEMPORARY\s+)?TABLE\s+)(?:"[^"]+"|[a-zA-Z0-9_#$]+)\s*\.\s*/gi, '$1');
  sql = sql.replace(/(\bALTER\s+TABLE\s+)(?:"[^"]+"|[a-zA-Z0-9_#$]+)\s*\.\s*/gi, '$1');
  sql = sql.replace(/(\bCREATE\s+(?:(?:UNIQUE|BITMAP)\s+)?INDEX\s+)(?:"[^"]+"|[a-zA-Z0-9_#$]+)\s*\.\s*/gi, '$1');
  sql = sql.replace(/(\bINDEX\s+(?:"[^"]+"|[a-zA-Z0-9_#$]+)\s+ON\s+)(?:"[^"]+"|[a-zA-Z0-9_#$]+)\s*\.\s*/gi, '$1');
  sql = sql.replace(/(\bREFERENCES\s+)(?:"[^"]+"|[a-zA-Z0-9_#$]+)\s*\.\s*/gi, '$1');

  sql = sql.replace(/([^;\s])(\s*)((?:CREATE|ALTER)\s+)/gi, '$1;\n\n$3');
  sql = sql.replace(/;(?:\s*;)+/g, ';');

  sql = sql.trim();
  if (sql && !sql.endsWith(';')) {
    sql += ';';
  }

  return sql;
}

function parseSqlComments(sqlText) {
  const tableComments = {};
  const columnComments = {};
  if (!sqlText) return { tableComments, columnComments };

  const tableCommentRegex = /COMMENT\s+ON\s+TABLE\s+(?:(?:"([^"]+)"|([^\s.,;()]+))\s*\.\s*)?(?:"([^"]+)"|([^\s.,;()]+))\s+IS\s+(?:'((?:''|\\'|[\s\S])*?)'|"((?:""|\\"|[\s\S])*?)")/gi;
  let match;
  while ((match = tableCommentRegex.exec(sqlText)) !== null) {
    const rawSchema = match[1] || match[2] || '';
    const rawTable = match[3] || match[4] || '';
    const rawComment = match[5] !== undefined ? match[5] : (match[6] !== undefined ? match[6] : '');
    const tableName = cleanIdentifier(rawTable || rawSchema).toLowerCase();
    if (!tableName) continue;

    const cleanComment = rawComment.replace(/''/g, "'").replace(/\\'/g, "'").replace(/""/g, '"').replace(/\\"/g, '"');
    tableComments[tableName] = { logicalName: '', note: cleanComment.trim() };
  }

  const columnCommentRegex = /COMMENT\s+ON\s+COLUMN\s+(?:(?:"([^"]+)"|([^\s.,;()]+))\s*\.\s*)?(?:"([^"]+)"|([^\s.,;()]+))\s*\.\s*(?:"([^"]+)"|([^\s.,;()]+))\s+IS\s+(?:'((?:''|\\'|[\s\S])*?)'|"((?:""|\\"|[\s\S])*?)")/gi;
  while ((match = columnCommentRegex.exec(sqlText)) !== null) {
    const rawTable = match[3] || match[4];
    const rawColumn = match[5] || match[6];
    const rawComment = match[7] !== undefined ? match[7] : (match[8] !== undefined ? match[8] : '');
    const tableName = cleanIdentifier(rawTable).toLowerCase();
    const columnName = cleanIdentifier(rawColumn).toLowerCase();
    if (!tableName || !columnName) continue;

    const cleanComment = rawComment.replace(/''/g, "'").replace(/\\'/g, "'").replace(/""/g, '"').replace(/\\"/g, '"');
    columnComments[`${tableName}.${columnName}`] = { logicalName: '', note: cleanComment.trim() };
  }

  return { tableComments, columnComments };
}

function extractOraclePhysicalAttributes(rawSql) {
  const tableAttributes = new Map();
  const dataTablespaces = new Set();
  const indexTablespaces = new Set();
  const lobTablespaces = new Set();

  const cleanSql = rawSql
    .replace(/^SQL>.*$/gm, '')
    .replace(/^.*DBMS_METADATA\.GET_DDL.*$/gm, '')
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // 日本語コメント: クォート有無・改行・スキーマ修飾の有無に対応した CREATE TABLE 正規表現
  const createTableRegex = /CREATE\s+(?:(GLOBAL\s+TEMPORARY|PRIVATE\s+TEMPORARY)\s+)?TABLE\s+(?:(?:"([^"]+)"|([a-zA-Z0-9_#$]+))\s*\.\s*)?(?:"([^"]+)"|([a-zA-Z0-9_#$]+))\s*\(/gi;
  let match;

  while ((match = createTableRegex.exec(cleanSql)) !== null) {
    const tempType = match[1] ? match[1].toUpperCase().replace(/\s+/g, ' ') : '';
    const rawTableName = match[4] || match[5];
    if (!rawTableName) continue;
    const tableName = cleanIdentifier(rawTableName).toUpperCase();

    const startParen = match.index + match[0].length - 1;
    let depth = 1;
    let endParen = -1;
    for (let i = startParen + 1; i < cleanSql.length; i++) {
      if (cleanSql[i] === '(') depth++;
      else if (cleanSql[i] === ')') depth--;
      if (depth === 0) {
        endParen = i;
        break;
      }
    }
    if (endParen === -1) continue;

    const insideParen = cleanSql.substring(startParen + 1, endParen);
    const nextSemicolon = cleanSql.indexOf(';', endParen + 1);
    let tailEnd = nextSemicolon !== -1 ? nextSemicolon : cleanSql.length;
    const nextCmdIndex = cleanSql.substring(endParen + 1, tailEnd).search(/\b(?:CREATE|ALTER)\b/i);
    if (nextCmdIndex !== -1) {
      tailEnd = endParen + 1 + nextCmdIndex;
    }
    const tailText = cleanSql.substring(endParen + 1, tailEnd);

    const custom = {};
    if (tempType) custom.table_type = tempType;

    const onCommitMatch = tailText.match(/ON\s+COMMIT\s+(DELETE|PRESERVE)\s+ROWS/i);
    if (onCommitMatch) custom.on_commit = `${onCommitMatch[1].toUpperCase()} ROWS`;

    const tailWithoutLob = tailText.replace(/\bLOB\s*\([^\)]+\)\s*STORE\s+AS\b[^;]*/gi, '');
    const tablespaceMatch = tailWithoutLob.match(/\bTABLESPACE\s+["']?([a-zA-Z0-9_#$]+)["']?/i);
    if (tablespaceMatch) {
      const ts = cleanIdentifier(tablespaceMatch[1]).toUpperCase();
      custom.tablespace = ts;
      dataTablespaces.add(ts);
    }

    const loggingMatch = tailText.match(/\b(LOGGING|NOLOGGING)\b/i);
    if (loggingMatch) custom.logging = loggingMatch[1].toUpperCase() === 'LOGGING';

    const pctfreeMatch = tailText.match(/\bPCTFREE\s+(\d+)\b/i);
    if (pctfreeMatch) custom.pctfree = parseInt(pctfreeMatch[1], 10);

    const initransMatch = tailText.match(/\bINITRANS\s+(\d+)\b/i);
    if (initransMatch) custom.initrans = parseInt(initransMatch[1], 10);

    const usingIndexMatch = insideParen.match(/USING\s+INDEX[^;]*?\bTABLESPACE\s+["']?([a-zA-Z0-9_#$]+)["']?/i);
    if (usingIndexMatch) {
      const idxTs = cleanIdentifier(usingIndexMatch[1]).toUpperCase();
      custom.index_tablespace = idxTs;
      indexTablespaces.add(idxTs);
    }

    const lobMatch = tailText.match(/\bLOB\s*\([^\)]+\)\s*STORE\s+AS\b[^;]*?\bTABLESPACE\s+["']?([a-zA-Z0-9_#$]+)["']?/i) ||
                     insideParen.match(/\bLOB\s*\([^\)]+\)\s*STORE\s+AS\b[^;]*?\bTABLESPACE\s+["']?([a-zA-Z0-9_#$]+)["']?/i);
    if (lobMatch) {
      const lobTs = cleanIdentifier(lobMatch[1]).toUpperCase();
      custom.lob_tablespace = lobTs;
      lobTablespaces.add(lobTs);
    }

    if (Object.keys(custom).length > 0) {
      tableAttributes.set(tableName, custom);
    }
  }

  // 日本語コメント: (1) ALTER TABLE ... ADD CONSTRAINT ... USING INDEX からのインデックス表領域抽出 (同一SQL文内のセミコロンまでを対象とし、後続文の越境マッチを防止)
  const alterIndexTsRegex = /ALTER\s+TABLE\s+(?:(?:"([^"]+)"|([a-zA-Z0-9_#$]+))\s*\.\s*)?(?:"([^"]+)"|([a-zA-Z0-9_#$]+))\s+ADD\s+(?:CONSTRAINT\s+["\w$]+\s+)?(?:PRIMARY\s+KEY|UNIQUE)\b[^;]*?\bUSING\s+INDEX\b[^;]*?\bTABLESPACE\s+["']?([a-zA-Z0-9_#$]+)["']?/gi;
  let alterMatch;
  while ((alterMatch = alterIndexTsRegex.exec(cleanSql)) !== null) {
    const rawTableName = alterMatch[3] || alterMatch[4] || alterMatch[1] || alterMatch[2];
    if (!rawTableName) continue;
    const tableName = cleanIdentifier(rawTableName).toUpperCase();
    const rawIdxTs = alterMatch[5];
    if (rawIdxTs) {
      const idxTs = cleanIdentifier(rawIdxTs).toUpperCase();
      if (idxTs) {
        indexTablespaces.add(idxTs);
        const custom = tableAttributes.get(tableName) || {};
        custom.index_tablespace = idxTs;
        tableAttributes.set(tableName, custom);
      }
    }
  }

  // 日本語コメント: (2) CREATE [UNIQUE/BITMAP] INDEX ... ON ... TABLESPACE からのインデックス表領域抽出 (同一SQL文内のセミコロンまでを対象とし、後続文の越境マッチを防止)
  const createIndexTsRegex = /CREATE\s+(?:(?:UNIQUE|BITMAP)\s+)?INDEX\s+(?:(?:"[^"]+"|[a-zA-Z0-9_#$]+)\s*\.\s*)?(?:"[^"]+"|[a-zA-Z0-9_#$]+)\s+ON\s+(?:(?:"([^"]+)"|([a-zA-Z0-9_#$]+))\s*\.\s*)?(?:"([^"]+)"|([a-zA-Z0-9_#$]+))\s*\([^;]*?\bTABLESPACE\s+["']?([a-zA-Z0-9_#$]+)["']?/gi;
  let createIndexMatch;
  while ((createIndexMatch = createIndexTsRegex.exec(cleanSql)) !== null) {
    const rawTableName = createIndexMatch[3] || createIndexMatch[4] || createIndexMatch[1] || createIndexMatch[2];
    if (!rawTableName) continue;
    const tableName = cleanIdentifier(rawTableName).toUpperCase();
    const rawIdxTs = createIndexMatch[5];
    if (rawIdxTs) {
      const idxTs = cleanIdentifier(rawIdxTs).toUpperCase();
      if (idxTs) {
        indexTablespaces.add(idxTs);
        const custom = tableAttributes.get(tableName) || {};
        // 日本語コメント: テーブルの index_tablespace が未設定であれば設定 (ALTER TABLE の主キー定義等を優先)
        if (!custom.index_tablespace) {
          custom.index_tablespace = idxTs;
          tableAttributes.set(tableName, custom);
        }
      }
    }
  }

  return {
    tableAttributes,
    projectCustom: {
      version: '1.0.0',
      dataTablespaces: Array.from(dataTablespaces),
      indexTablespaces: Array.from(indexTablespaces),
      lobTablespaces: Array.from(lobTablespaces),
    },
  };
}

function attachMetadataToDbml(dbml, { physicalInfo, commentsInfo }, schemaName = 'imported_schema', databaseType = 'Oracle (12c+)', options = {}) {
  let result = dbml;
  const commentTarget = options.commentTarget || 'logicalName';
  const tableHeaderRegex = /^\s*Table\s+(?:(?:"([^"]+)"|([^\s.,;(){}\[\]]+))\.)?(?:"([^"]+)"|([^\s.,;(){}\[\]]+))(?:\s+as\s+(?:"[^"]+"|[^\s.,;(){}\[\]]+))?(?:\s*\[([^\]]*)\])?\s*\{/gim;

  let newDbml = '';
  let lastIndex = 0;
  let match;
  const metadataBlocks = [];

  while ((match = tableHeaderRegex.exec(result)) !== null) {
    const rawSchema = match[1] || match[2] || '';
    const rawTable = match[3] || match[4] || '';
    const existingTableSettings = match[5] || '';
    const tableName = cleanIdentifier(rawTable || rawSchema).toUpperCase();
    const tableNameLower = tableName.toLowerCase();

    const headerStart = match.index;
    const bodyStart = headerStart + match[0].length;

    let depth = 1;
    let bodyEnd = -1;
    for (let i = bodyStart; i < result.length; i++) {
      const char = result[i];
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          bodyEnd = i;
          break;
        }
      }
    }
    if (bodyEnd === -1) continue;

    newDbml += result.substring(lastIndex, headerStart);
    let body = result.substring(bodyStart, bodyEnd);
    const tableComment = commentsInfo.tableComments[tableNameLower] || {};
    const tableCustom = { ...(physicalInfo.tableAttributes.get(tableName) || {}) };

    let tableNoteToEmit = '';
    let tableSettingsTrimmed = existingTableSettings.trim();
    const tblCommentText = tableComment.logicalName || tableComment.note || '';
    if (tblCommentText && commentTarget !== 'none') {
      if (commentTarget === 'logicalName' || commentTarget === 'both') {
        const cleanTblLogical = tblCommentText.replace(/[\r\n]+/g, '').trim();
        if (cleanTblLogical && !/logicalName\s*:/i.test(tableSettingsTrimmed)) {
          const lnProp = `logicalName: '${escapeDbmlInlineString(cleanTblLogical)}'`;
          tableSettingsTrimmed = tableSettingsTrimmed ? `${tableSettingsTrimmed}, ${lnProp}` : lnProp;
        }
        if (commentTarget === 'both') tableNoteToEmit = tblCommentText;
      } else if (commentTarget === 'note') {
        tableNoteToEmit = tblCommentText;
      } else if (commentTarget === 'designNote') {
        tableCustom.entityNote = tblCommentText;
      } else if (commentTarget === 'definition') {
        tableCustom.definition = tblCommentText;
      }
    }

    const settingsBlock = tableSettingsTrimmed ? ` [${tableSettingsTrimmed}]` : '';

    const bodyLines = body.split(/\r?\n/);
    const updatedLines = [];
    const inlinePkCols = [];
    let inIndexesBlock = false;
    let inChecksBlock = false;
    let hasIndexesBlock = false;
    let hasPkInIndexesBlock = false;

    // 日本語コメント: Indexes ブロック内の [pk] 行を先行スキャンし、主キーカラム集合・PKインデックス名・カラム構成シグネチャを抽出
    const indexesBlockPkColSet = new Set();
    const pkIndexNameSet = new Set();
    const pkColSigSet = new Set();
    let scanInIndexes = false;
    for (const rawLine of bodyLines) {
      const tLine = rawLine.trim();
      if (/^\s*indexes\s*\{/i.test(rawLine)) {
        scanInIndexes = true;
        continue;
      }
      if (scanInIndexes) {
        if (tLine === '}') {
          scanInIndexes = false;
          continue;
        }
        const idxSettingsMatch = tLine.match(/\[([^\]]*)\]\s*$/);
        if (idxSettingsMatch && /\bpk\b/i.test(idxSettingsMatch[1])) {
          const settingsStr = idxSettingsMatch[1];
          const colsPart = tLine.slice(0, idxSettingsMatch.index).trim().replace(/^\(|\)$/g, '');
          const idxCols = colsPart
            .split(',')
            .map(c => cleanIdentifier(c).toUpperCase())
            .filter(Boolean);
          idxCols.forEach(c => indexesBlockPkColSet.add(c));
          if (idxCols.length > 0) {
            pkColSigSet.add(idxCols.join(','));
            pkColSigSet.add([...idxCols].sort().join(','));
          }
          const nameMatch = settingsStr.match(/\bname\s*:\s*(?:"([^"]+)"|'([^']+)')/i);
          if (nameMatch) {
            const pkIdxName = cleanIdentifier(nameMatch[1] || nameMatch[2]).toUpperCase();
            if (pkIdxName) pkIndexNameSet.add(pkIdxName);
          }
        }
      }
    }

    for (let line of bodyLines) {
      const trimmed = line.trim();
      if (/^\s*indexes\s*\{/i.test(line)) {
        inIndexesBlock = true;
        hasIndexesBlock = true;
        updatedLines.push(line);
        continue;
      }
      if (/^\s*checks\s*\{/i.test(line)) {
        inChecksBlock = true;
        updatedLines.push(line);
        continue;
      }
      if (inIndexesBlock) {
        if (trimmed === '}') {
          if (inlinePkCols.length > 0 && !hasPkInIndexesBlock) {
            const pkTarget = inlinePkCols.length > 1
              ? `(${inlinePkCols.map(c => `"${c}"`).join(', ')})`
              : `"${inlinePkCols[0]}"`;
            updatedLines.push(`    ${pkTarget} [pk, name: "PK_${tableName}"]`);
            hasPkInIndexesBlock = true;
          }
          inIndexesBlock = false;
          updatedLines.push(line);
          continue;
        }
        const idxSettingsMatch = trimmed.match(/\[([^\]]*)\]\s*$/);
        const settingsStr = idxSettingsMatch ? idxSettingsMatch[1] : '';
        if (/\bpk\b/i.test(settingsStr)) {
          hasPkInIndexesBlock = true;
        } else if (idxSettingsMatch) {
          // 日本語コメント: PK裏付け用の重複CREATE UNIQUE INDEX行（PKと同名、または同一カラム構成のuniqueインデックス）を除外
          const colsPart = trimmed.slice(0, idxSettingsMatch.index).trim().replace(/^\(|\)$/g, '');
          const idxCols = colsPart
            .split(',')
            .map(c => cleanIdentifier(c).toUpperCase())
            .filter(Boolean);
          const colSig = idxCols.join(',');
          const colSortSig = [...idxCols].sort().join(',');
          const nameMatch = settingsStr.match(/\bname\s*:\s*(?:"([^"]+)"|'([^']+)')/i);
          const idxName = nameMatch ? cleanIdentifier(nameMatch[1] || nameMatch[2]).toUpperCase() : '';
          const isDuplicateOfPk = (idxName && pkIndexNameSet.has(idxName)) ||
            (/\bunique\b/i.test(settingsStr) && colSig && (pkColSigSet.has(colSig) || pkColSigSet.has(colSortSig)));
          if (isDuplicateOfPk) {
            continue;
          }
        }
        updatedLines.push(line);
        continue;
      }
      if (inChecksBlock) {
        if (trimmed === '}') inChecksBlock = false;
        updatedLines.push(line);
        continue;
      }

      if (trimmed.startsWith('//') || trimmed.startsWith('Note:') || trimmed === '') {
        updatedLines.push(line);
        continue;
      }

      const colMatch = line.match(/^(\s*)(?:"([^"]+)"|([^\s\[\]{}]+))\s+([^\[\n]+?)(?:\s*\[([^\]]*)\])?\s*$/);
      if (colMatch) {
        const indent = colMatch[1];
        const colName = cleanIdentifier(colMatch[2] || colMatch[3]).toUpperCase();
        const colNameLower = colName.toLowerCase();
        const colType = colMatch[4].trim();
        let colSettings = (colMatch[5] || '').trim();

        const isInlinePk = /\b(?:pk|primary\s+key)\b/i.test(colSettings);
        if (isInlinePk) {
          inlinePkCols.push(colName);
          colSettings = colSettings
            .split(',')
            .map(s => s.trim())
            .filter(s => !/^(?:pk|primary\s+key)$/i.test(s))
            .join(', ');
        }
        // 日本語コメント: インラインPKまたはIndexesブロック内のPKに含まれるカラムには必ず not null を付与
        if ((isInlinePk || indexesBlockPkColSet.has(colName)) && !/\bnot\s+null\b/i.test(colSettings)) {
          colSettings = colSettings ? `not null, ${colSettings}` : 'not null';
        }

        const colKey = `${tableNameLower}.${colNameLower}`;
        const colComment = commentsInfo.columnComments[colKey] || {};
        const colCommentText = colComment.logicalName || colComment.note || '';

        const colMeta = {};
        if (colCommentText && commentTarget !== 'none') {
          if (commentTarget === 'logicalName' || commentTarget === 'both') {
            const cleanColLogical = colCommentText.replace(/[\r\n]+/g, '').trim();
            if (cleanColLogical && !/logicalName\s*:/i.test(colSettings)) {
              const lnProp = `logicalName: '${escapeDbmlInlineString(cleanColLogical)}'`;
              colSettings = colSettings ? `${colSettings}, ${lnProp}` : lnProp;
            }
            if (commentTarget === 'both' && !/note\s*:/i.test(colSettings)) {
              colSettings = colSettings ? `${colSettings}, note: '${escapeDbmlInlineString(colCommentText)}'` : `note: '${escapeDbmlInlineString(colCommentText)}'`;
            }
          } else if (commentTarget === 'note' && !/note\s*:/i.test(colSettings)) {
            colSettings = colSettings ? `${colSettings}, note: '${escapeDbmlInlineString(colCommentText)}'` : `note: '${escapeDbmlInlineString(colCommentText)}'`;
          } else if (commentTarget === 'designNote') {
            colMeta.columnNote = colCommentText;
          } else if (commentTarget === 'definition') {
            colMeta.definition = colCommentText;
          }
        }

        if (Object.keys(colMeta).length > 0) {
          const metaLines = Object.entries(colMeta).map(([k, v]) => `  ${k}: ${formatMetadataValue(v)}`);
          metadataBlocks.push(`Metadata Column "${tableName}"."${colName}" {\n${metaLines.join('\n')}\n}`);
        }

        const newSettingsStr = colSettings ? ` [${colSettings}]` : '';
        updatedLines.push(`${indent}"${colName}" ${colType}${newSettingsStr}`);
      } else {
        updatedLines.push(line);
      }
    }

    if (!hasIndexesBlock && inlinePkCols.length > 0) {
      const pkTarget = inlinePkCols.length > 1
        ? `(${inlinePkCols.map(c => `"${c}"`).join(', ')})`
        : `"${inlinePkCols[0]}"`;
      updatedLines.push('');
      updatedLines.push('  Indexes {');
      updatedLines.push(`    ${pkTarget} [pk, name: "PK_${tableName}"]`);
      updatedLines.push('  }');
    }

    body = updatedLines.join('\n');

    const cleanNote = escapeDbmlBlockString(tableNoteToEmit || '');
    if (cleanNote) {
      const existingNoteRegex = /\n\s*Note:\s*(?:'''([\s\S]*?)'''|'([^']*)'|"([^"]*)")/i;
      const noteMatch = body.match(existingNoteRegex);
      const noteBlock = cleanNote.includes('\n')
        ? `\n  Note: '''\n${cleanNote}\n  '''`
        : `\n  Note: '${escapeDbmlInlineString(cleanNote)}'`;

      if (noteMatch) {
        body = body.replace(existingNoteRegex, noteBlock);
      } else {
        body = `${body.trimEnd()}${noteBlock}\n`;
      }
    }

    if (Object.keys(tableCustom).length > 0) {
      const metaLines = Object.entries(tableCustom).map(([k, v]) => `  ${k}: ${formatMetadataValue(v)}`);
      metadataBlocks.push(`Metadata Table "${tableName}" {\n${metaLines.join('\n')}\n}`);
    }

    newDbml += `Table "${tableName}"${settingsBlock} {${body}}`;
    lastIndex = bodyEnd + 1;
  }

  newDbml += result.substring(lastIndex);

  if (!/^\s*Project\s+/im.test(newDbml)) {
    const pc = physicalInfo.projectCustom || {};
    const projLines = [`Project "${schemaName}" {`];
    projLines.push(`  database_type: '${escapeDbmlInlineString(databaseType)}'`);
    if (pc.version) projLines.push(`  version: '${escapeDbmlInlineString(pc.version)}'`);
    if (Array.isArray(pc.dataTablespaces) && pc.dataTablespaces.length > 0) {
      projLines.push(`  data_tablespaces: '${escapeDbmlInlineString(pc.dataTablespaces.join(', '))}'`);
    }
    if (Array.isArray(pc.indexTablespaces) && pc.indexTablespaces.length > 0) {
      projLines.push(`  index_tablespaces: '${escapeDbmlInlineString(pc.indexTablespaces.join(', '))}'`);
    }
    if (Array.isArray(pc.lobTablespaces) && pc.lobTablespaces.length > 0) {
      projLines.push(`  lob_tablespaces: '${escapeDbmlInlineString(pc.lobTablespaces.join(', '))}'`);
    }
    projLines.push('}\n\n');
    newDbml = projLines.join('\n') + newDbml.trimStart();
  }

  if (metadataBlocks.length > 0) {
    newDbml = `${newDbml.trimEnd()}\n\n${metadataBlocks.join('\n\n')}\n`;
  }

  return newDbml;
}

export function createOracleImporter(config = {}, context) {
  const BaseImporter = context?.api?.BaseImporter || class {
    constructor(cfg) { this.config = cfg; }
    async import(content, options) { return content; }
  };

  return new class OracleImporter extends BaseImporter {
    constructor() {
      super(config);
    }

    get importOptions() {
      return [
        {
          key: 'commentTarget',
          label: 'COMMENT ON の反映先',
          type: 'select',
          options: [
            { label: '論理名 (logicalName) 【推奨】', value: 'logicalName' },
            { label: '論理名とDBML標準Noteの両方', value: 'both' },
            { label: 'DBML標準 Note', value: 'note' },
            { label: '設計ノート (entityNote / columnNote)', value: 'designNote' },
            { label: '定義メタデータ (definition)', value: 'definition' },
            { label: '取り込まない (無視)', value: 'none' },
          ],
          default: 'logicalName',
        },
      ];
    }

    async preprocess(rawSql, options = {}) {
      // 日本語コメント: Step 1 (10%) DDL解析開始の進捗通知
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 1, percent: 10, message: 'DDL解析中...' });
      }

      const physicalInfo = extractOraclePhysicalAttributes(rawSql);
      const commentsInfo = parseSqlComments(rawSql);
      const cleanedSql = preprocessOracleDdl(rawSql);

      // 日本語コメント: Step 1 (25%) 抽出テーブル数・制約数のカウントと進捗通知
      const tableCount = physicalInfo?.tableAttributes?.size || 0;
      const constraintCount = rawSql.match(/\bADD\s+CONSTRAINT\b/gi)?.length || 0;
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({
          step: 1,
          percent: 25,
          message: `制約を抽出中... (${tableCount}テーブル, ${constraintCount}制約)`,
        });
      }

      return {
        cleanedSql,
        physicalInfo,
        commentsInfo,
        warnings: [],
      };
    }

    async process(cleanedSql, options = {}) {
      // 日本語コメント: Step 2 (35%) サーバーAPI呼び出し前のDBML変換進捗通知
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 2, percent: 35, message: 'DBML変換中...' });
      }

      const res = await fetch('/api/parse/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: cleanedSql,
          format: 'oracle',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `SQLパースエラー (HTTP ${res.status})`);
      }

      const data = await res.json();

      // 日本語コメント: Step 2 (50%) DBML変換完了進捗通知
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 2, percent: 50, message: 'DBML変換完了' });
      }

      return data.dbml || '';
    }

    async postprocess(baseDbml, preprocessed = {}, options = {}) {
      const tableCount = preprocessed?.physicalInfo?.tableAttributes?.size || 0;

      // 日本語コメント: Step 3 (65%) 属性結合開始前の進捗通知
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({
          step: 3,
          percent: 65,
          message: `属性結合中... (${tableCount}テーブル)`,
        });
      }

      const schemaName = options.schemaName || 'imported_schema';
      const databaseType = this.config.dbmlDatabaseType || 'Oracle (12c+)';
      const result = attachMetadataToDbml(baseDbml, preprocessed, schemaName, databaseType, options);

      // 日本語コメント: Step 3 (75%) 属性結合完了進捗通知
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 3, percent: 75, message: '属性結合完了' });
      }

      return result;
    }
  }();
}

