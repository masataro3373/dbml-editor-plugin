// 日本語コメント: Snowflake DDL インポーター実装 (plugins/snowflake-dialect/importer.js)

function preprocessSnowflakeDdl(rawSql) {
  let sql = String(rawSql || '');
  sql = sql.replace(/\bCLUSTER\s+BY\s*\([^)]*\)/gi, '');
  sql = sql.replace(/\bDATA_RETENTION_TIME_IN_DAYS\s*=\s*\d+/gi, '');
  sql = sql.replace(/\bCOPY\s+GRANTS\b/gi, '');
  sql = sql.replace(/\bCREATE\s+OR\s+REPLACE\s+TABLE\b/gi, 'CREATE TABLE');
  return sql.trim();
}

export function createSnowflakeImporter(config = {}, context) {
  const BaseImporter = context?.api?.BaseImporter || class {
    constructor(cfg) { this.config = cfg; }
  };

  return new class SnowflakeImporter extends BaseImporter {
    constructor() { super(config); }

    async preprocess(rawSql, options = {}) {
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 1, percent: 25, message: 'Snowflake DDL を前処理中...' });
      }
      return { cleanedSql: preprocessSnowflakeDdl(rawSql), warnings: [] };
    }

    async process(cleanedSql, options = {}) {
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 2, percent: 50, message: 'DBML 変換中...' });
      }
      const res = await fetch('/api/parse/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: cleanedSql, format: 'snowflake' }),
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
      const databaseType = this.config.dbmlDatabaseType || 'Snowflake';
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
