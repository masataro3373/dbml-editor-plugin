// 日本語コメント: Amazon Redshift DDL インポーター実装 (plugins/redshift-dialect/importer.js)

function preprocessRedshiftDdl(rawSql) {
  let sql = String(rawSql || '');
  sql = sql.replace(/\bDISTSTYLE\s+(?:AUTO|EVEN|KEY|ALL)\b/gi, '');
  sql = sql.replace(/\bDISTKEY\s*\([^)]*\)/gi, '');
  sql = sql.replace(/\b(?:COMPOUND|INTERLEAVED)?\s*SORTKEY\s*\([^)]*\)/gi, '');
  sql = sql.replace(/\bENCODE\s+[a-zA-Z0-9_]+\b/gi, '');
  sql = sql.replace(/\bBACKUP\s+(?:YES|NO)\b/gi, '');
  return sql.trim();
}

export function createRedshiftImporter(config = {}, context) {
  const BaseImporter = context?.api?.BaseImporter || class {
    constructor(cfg) { this.config = cfg; }
  };

  return new class RedshiftImporter extends BaseImporter {
    constructor() { super(config); }

    async preprocess(rawSql, options = {}) {
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 1, percent: 25, message: 'Redshift DDL を前処理中...' });
      }
      return { cleanedSql: preprocessRedshiftDdl(rawSql), warnings: [] };
    }

    async process(cleanedSql, options = {}) {
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 2, percent: 50, message: 'DBML 変換中...' });
      }
      const res = await fetch('/api/parse/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: cleanedSql, format: 'postgres' }),
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
      const databaseType = this.config.dbmlDatabaseType || 'Redshift';
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
