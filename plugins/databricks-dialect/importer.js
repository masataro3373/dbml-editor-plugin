// 日本語コメント: Databricks SQL / Delta Lake DDL インポーター実装 (plugins/databricks-dialect/importer.js)

function preprocessDatabricksDdl(rawSql) {
  let sql = String(rawSql || '');
  sql = sql.replace(/\bUSING\s+(?:DELTA|PARQUET|ORC|CSV|JSON|AVRO)\b/gi, '');
  sql = sql.replace(/\bPARTITIONED\s+BY\s*\([^)]*\)/gi, '');
  sql = sql.replace(/\bTBLPROPERTIES\s*\([^)]*\)/gi, '');
  sql = sql.replace(/\bLOCATION\s+'[^']*'/gi, '');
  sql = sql.replace(/\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/gi, 'AUTO_INCREMENT');
  return sql.trim();
}

export function createDatabricksImporter(config = {}, context) {
  const BaseImporter = context?.api?.BaseImporter || class {
    constructor(cfg) { this.config = cfg; }
  };

  return new class DatabricksImporter extends BaseImporter {
    constructor() { super(config); }

    async preprocess(rawSql, options = {}) {
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 1, percent: 25, message: 'Databricks DDL を前処理中...' });
      }
      return { cleanedSql: preprocessDatabricksDdl(rawSql), warnings: [] };
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
      const databaseType = this.config.dbmlDatabaseType || 'Databricks';
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
