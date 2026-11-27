// 日本語コメント: Google Cloud Spanner DDL インポーター実装 (plugins/spanner-dialect/importer.js)

function preprocessSpannerDdl(rawSql) {
  let sql = String(rawSql || '');
  // Spanner 固有の括弧外 PRIMARY KEY / INTERLEAVE IN PARENT / ROW DELETION POLICY をクレンジング
  sql = sql.replace(/,\s*INTERLEAVE\s+IN\s+PARENT\s+[^\n;]+/gi, '');
  sql = sql.replace(/,\s*ROW\s+DELETION\s+POLICY\s*\([^)]*\)/gi, '');
  sql = sql.replace(/\)\s*PRIMARY\s+KEY\s*\(([^)]+)\)\s*;/gi, (m, pkCols) => `,\n  PRIMARY KEY (${pkCols})\n);`);
  sql = sql.replace(/\bNULL_FILTERED\s+INDEX\b/gi, 'INDEX');
  return sql.trim();
}

export function createSpannerImporter(config = {}, context) {
  const BaseImporter = context?.api?.BaseImporter || class {
    constructor(cfg) { this.config = cfg; }
  };

  return new class SpannerImporter extends BaseImporter {
    constructor() { super(config); }

    async preprocess(rawSql, options = {}) {
      if (typeof options?.onProgress === 'function') {
        await options.onProgress({ step: 1, percent: 25, message: 'Cloud Spanner DDL を前処理中...' });
      }
      return { cleanedSql: preprocessSpannerDdl(rawSql), warnings: [] };
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
      const databaseType = this.config.dbmlDatabaseType || 'Cloud Spanner';
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
