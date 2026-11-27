// 日本語コメント: MySQL / MariaDB DDL インポーター実装 (plugins/mysql-dialect/importer.js)
// context.api.BaseImporter を継承し、oracle-dialect と統一されたインターフェース (importOptions, COMMENT -> logicalName/Note 反映, postprocess 文字列返却) を提供します。

function escapeDbmlInlineString(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r\n|\r|\n/g, '\\n');
}

function cleanIdentifier(identifierStr) {
  if (!identifierStr) return '';
  let str = String(identifierStr).trim();
  if (str.includes('.')) {
    const parts = str.split('.');
    str = parts[parts.length - 1];
  }
  return str.replace(/^["'`]|["'`]$/g, '').trim();
}

function preprocessMysqlDdl(rawSql) {
  let sql = String(rawSql || '');
  // mysqldump の条件付きコメント (/*!40101 ... */) や LOCK/UNLOCK TABLES 等の除去
  sql = sql.replace(/\/\*![\s\S]*?\*\//g, '');
  sql = sql.replace(/^\s*(?:LOCK|UNLOCK)\s+TABLES\b[^;]*;/gim, '');
  sql = sql.replace(/^\s*SET\s+[^;]*;/gim, '');
  sql = sql.replace(/^\s*USE\s+[^;]*;/gim, '');
  return sql.trim();
}

function attachMysqlCommentsToDbml(dbml, schemaName, databaseType, options = {}) {
  const commentTarget = options.commentTarget || 'logicalName';
  const tableHeaderRegex = /^\s*Table\s+(?:(?:"([^"]+)"|([^\s.,;(){}\[\]]+))\.)?(?:"([^"]+)"|([^\s.,;(){}\[\]]+))(?:\s+as\s+(?:"[^"]+"|[^\s.,;(){}\[\]]+))?(?:\s*\[([^\]]*)\])?\s*\{/gim;

  let result = String(dbml || '');
  let newDbml = '';
  let lastIndex = 0;
  let match;

  while ((match = tableHeaderRegex.exec(result)) !== null) {
    const rawSchema = match[1] || match[2] || '';
    const rawTable = match[3] || match[4] || '';
    const existingTableSettings = (match[5] || '').trim();
    const tableName = cleanIdentifier(rawTable || rawSchema);

    const headerStart = match.index;
    const bodyStart = headerStart + match[0].length;
    let depth = 1;
    let bodyEnd = -1;
    for (let i = bodyStart; i < result.length; i++) {
      if (result[i] === '{') depth++;
      else if (result[i] === '}') {
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

    // @dbml/core が MySQL の TABLE COMMENT='...' から生成した Note: '...' を検出
    const existingNoteRegex = /\n\s*Note:\s*(?:'''([\s\S]*?)'''|'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)")/i;
    const noteMatch = body.match(existingNoteRegex);
    const tblCommentText = noteMatch ? (noteMatch[1] ?? noteMatch[2] ?? noteMatch[3] ?? '').trim() : '';

    let tableSettingsTrimmed = existingTableSettings;
    if (tblCommentText && commentTarget !== 'none') {
      if (commentTarget === 'logicalName' || commentTarget === 'both') {
        const cleanTblLogical = tblCommentText.replace(/[\r\n]+/g, ' ').trim();
        if (cleanTblLogical && !/logicalName\s*:/i.test(tableSettingsTrimmed)) {
          const lnProp = `logicalName: '${escapeDbmlInlineString(cleanTblLogical)}'`;
          tableSettingsTrimmed = tableSettingsTrimmed ? `${tableSettingsTrimmed}, ${lnProp}` : lnProp;
        }
        if (commentTarget === 'logicalName' && noteMatch) {
          body = body.replace(existingNoteRegex, '');
        }
      }
    } else if (commentTarget === 'none' && noteMatch) {
      body = body.replace(existingNoteRegex, '');
    }

    const bodyLines = body.split(/\r?\n/);
    const updatedLines = [];
    let inSubBlock = false;

    for (const line of bodyLines) {
      const trimmed = line.trim();
      if (/^\s*(indexes|checks)\s*\{/i.test(line)) {
        inSubBlock = true;
        updatedLines.push(line);
        continue;
      }
      if (inSubBlock) {
        if (trimmed === '}') inSubBlock = false;
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
        const rawColName = colMatch[2] || colMatch[3];
        const colName = cleanIdentifier(rawColName);
        const colType = colMatch[4].trim();
        let colSettings = (colMatch[5] || '').trim();

        const inlineNoteMatch = colSettings.match(/\bnote\s*:\s*(?:'((?:''|\\'|[^'])*)'|"((?:""|\\"|[^"])*)")/i);
        const colCommentText = inlineNoteMatch ? (inlineNoteMatch[1] ?? inlineNoteMatch[2] ?? '').trim() : '';

        if (colCommentText && commentTarget !== 'none') {
          if (commentTarget === 'logicalName' || commentTarget === 'both') {
            const cleanColLogical = colCommentText.replace(/[\r\n]+/g, ' ').trim();
            if (cleanColLogical && !/logicalName\s*:/i.test(colSettings)) {
              if (commentTarget === 'logicalName' && inlineNoteMatch) {
                colSettings = colSettings.replace(inlineNoteMatch[0], `logicalName: '${escapeDbmlInlineString(cleanColLogical)}'`);
              } else {
                const lnProp = `logicalName: '${escapeDbmlInlineString(cleanColLogical)}'`;
                colSettings = colSettings ? `${colSettings}, ${lnProp}` : lnProp;
              }
            }
          }
        }
        const newSettingsStr = colSettings ? ` [${colSettings}]` : '';
        updatedLines.push(`${indent}"${colName}" ${colType}${newSettingsStr}`);
      } else {
        updatedLines.push(line);
      }
    }

    const settingsBlock = tableSettingsTrimmed ? ` [${tableSettingsTrimmed}]` : '';
    newDbml += `Table "${tableName}"${settingsBlock} {${updatedLines.join('\n')}}`;
    lastIndex = bodyEnd + 1;
  }

  newDbml += result.substring(lastIndex);

  if (!/^\s*Project\s+/im.test(newDbml)) {
    newDbml = `Project "${schemaName}" {\n  database_type: '${escapeDbmlInlineString(databaseType)}'\n}\n\n${newDbml.trimStart()}`;
  }
  return newDbml;
}

export function createMysqlImporter(config = {}, context) {
  const BaseImporter = context?.api?.BaseImporter || class {
    constructor(cfg) { this.config = cfg; }
  };

  return new class MysqlImporter extends BaseImporter {
    constructor() {
      super(config);
    }

    get importOptions() {
      return [
        {
          key: 'commentTarget',
          label: 'COMMENT の反映先',
          type: 'select',
          options: [
            { label: '論理名 (logicalName) 【推奨】', value: 'logicalName' },
            { label: '論理名とDBML標準Noteの両方', value: 'both' },
            { label: 'DBML標準 Note', value: 'note' },
            { label: '取り込まない (無視)', value: 'none' },
          ],
          default: 'logicalName',
        },
      ];
    }

    async preprocess(rawSql, options = {}) {
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 1, percent: 25, message: 'MySQL DDL を前処理中...' });
      }
      return {
        cleanedSql: preprocessMysqlDdl(rawSql),
        warnings: [],
      };
    }

    async process(cleanedSql, options = {}) {
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 2, percent: 50, message: 'DBML 変換中...' });
      }
      const res = await fetch('/api/parse/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: cleanedSql,
          format: 'mysql',
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `SQLパースエラー (HTTP ${res.status})`);
      }
      const data = await res.json();
      return data.dbml || '';
    }

    async postprocess(baseDbml, preprocessed = {}, options = {}) {
      const schemaName = options.schemaName || 'imported_schema';
      const databaseType = this.config.dbmlDatabaseType || 'MySQL';
      const result = attachMysqlCommentsToDbml(baseDbml, schemaName, databaseType, options);
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 3, percent: 75, message: '完了' });
      }
      // 日本語コメント: BaseImporter インターフェース準拠（DBML文字列を直接返却）
      return result;
    }
  }();
}
