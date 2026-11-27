// 日本語コメント: PostgreSQL 方言プラグイン エントリポイント (plugins/postgres-dialect/index.js)
// PostgreSQL の方言登録、物理メタデータ属性登録、DDLインポーター/エクスポーター、マイグレーション生成エンジンを提供します。

import { postgresConfig, postgresMetadataDef } from './config.js';
import { createPostgresImporter } from './importer.js';
import { createPostgresExporter } from './exporter.js';
import { generatePostgresMigrationScripts } from './migration-generator.js';

export default {
  async activate(context) {
    const { BaseDialect } = context.api;
    const ejs = context.libs?.ejs;

    class PostgresDialect extends BaseDialect {
      constructor(config) {
        super(config);
        this.importer = createPostgresImporter(config, context);
        this.exporter = createPostgresExporter(config, ejs, context);
        this.migrationGenerator = (diffResult, targetTableNames, options) => {
          return generatePostgresMigrationScripts(diffResult, targetTableNames, config, options);
        };
      }
    }

    context.dialects.register(new PostgresDialect(postgresConfig));
    context.metadata.registerAttributes(postgresMetadataDef);
  },
};
