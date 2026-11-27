// 日本語コメント: Google BigQuery DDL インポーター実装 (plugins/bigquery-dialect/importer.js)

function preprocessBigqueryDdl(rawSql) {
  let sql = String(rawSql || '');
  // BigQuery 固有句を除去して標準 SQL 互換へクレンジング
  sql = sql.replace(/\bOPTIONS\s*\([^)]*\)/gi, '');
  sql = sql.replace(/\bPARTITION\s+BY\s+[^\n;]+/gi, '');
  sql = sql.replace(/\bCLUSTER\s+BY\s+[^\n;]+/gi, '');
  sql = sql.replace(/\bNOT\s+ENFORCED\b/gi, '');
  sql = sql.replace(/`([^`.]+)\.([^`]+)`/g, '`$2`');
  return sql.trim();
}

export function createBigqueryImporter(config = {}, context) {
  const BaseImporter = context?.api?.BaseImporter || class {
    constructor(cfg) { this.config = cfg; }
  };

  return new class BigqueryImporter extends BaseImporter {
    constructor() { super(config); }

    async preprocess(rawSql, options = {}) {
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 1, percent: 25, message: 'BigQuery DDL を前処理中...' });
      }
      return { cleanedSql: preprocessBigqueryDdl(rawSql), warnings: [] };
    }

    async process(cleanedSql, options = {}) {
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 2, percent: 50, message: 'DBML 変換中...' });
      }
      const res = await fetch('/api/parse/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: cleanedSql, format: 'mysql' }),
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
      const databaseType = this.config.dbmlDatabaseType || 'BigQuery';
      let dbml = String(baseDbml || '').trim();
      if (!/^Project\s+/im.test(dbml)) {
        dbml = `Project "${schemaName}" {\n  database_type: '${databaseType}'\n}\n\n${dbml}`;
      }
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 3, percent: 75, message: '完了' });
      }
      return dbml;
    }
  }();
}
