// 日本語コメント: SQL Server / MS-SQL 方言プラグイン エントリポイント (plugins/mssql-dialect/index.js)

import { mssqlConfig, mssqlMetadataDef } from './config.js';
import { createMssqlImporter } from './importer.js';
import { createMssqlExporter } from './exporter.js';
import { generateMssqlMigrationScripts } from './migration-generator.js';

export default {
  async activate(context) {
    const { BaseDialect } = context.api;
    const ejs = context.libs?.ejs;

    class MssqlDialect extends BaseDialect {
      constructor(config) {
        super(config);
        this.importer = createMssqlImporter(config, context);
        this.exporter = createMssqlExporter(config, ejs, context);
        this.migrationGenerator = (diffResult, targetTableNames, options) => {
          return generateMssqlMigrationScripts(diffResult, targetTableNames, config, options);
        };
      }
    }

    context.dialects.register(new MssqlDialect(mssqlConfig));
    context.metadata.registerAttributes(mssqlMetadataDef);
  },
};
