// 日本語コメント: SQL Server / MS-SQL DDL インポーター実装 (plugins/mssql-dialect/importer.js)

function preprocessMssqlDdl(rawSql) {
  let sql = String(rawSql || '');
  // T-SQL 固有のバッチ区切り GO, SET ANSI_NULLS, USE, ON [PRIMARY] 等の除去
  sql = sql.replace(/^\s*GO\s*$/gim, '');
  sql = sql.replace(/^\s*SET\s+(?:ANSI_NULLS|QUOTED_IDENTIFIER|NOCOUNT)\s+(?:ON|OFF)\s*;?/gim, '');
  sql = sql.replace(/^\s*USE\s+\[?[\w]+\]?\s*;?/gim, '');
  sql = sql.replace(/\bON\s+\[?PRIMARY\]?\b/gi, '');
  sql = sql.replace(/\bTEXTIMAGE_ON\s+\[?PRIMARY\]?\b/gi, '');
  sql = sql.replace(/\bWITH\s*\([^)]*PAD_INDEX[^)]*\)/gi, '');
  return sql.trim();
}

export function createMssqlImporter(config = {}, context) {
  const BaseImporter = context?.api?.BaseImporter || class {
    constructor(cfg) { this.config = cfg; }
  };

  return new class MssqlImporter extends BaseImporter {
    constructor() {
      super(config);
    }

    async preprocess(rawSql, options = {}) {
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 1, percent: 25, message: 'SQL Server DDL を前処理中...' });
      }
      return {
        cleanedSql: preprocessMssqlDdl(rawSql),
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
          format: 'mssql',
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
      const databaseType = this.config.dbmlDatabaseType || 'SQL Server';
      let dbml = String(baseDbml || '').trim();
      if (!/^Project\s+/im.test(dbml)) {
        dbml = `Project "${schemaName}" {\n  database_type: '${databaseType}'\n}\n\n${dbml}`;
      }
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 3, percent: 75, message: '完了' });
      }
      // 日本語コメント: BaseImporter インターフェース準拠（DBML文字列を直接返却）
      return dbml;
    }
  }();
}
