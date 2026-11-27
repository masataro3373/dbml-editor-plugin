// 日本語コメント: MySQL / MariaDB 方言プラグイン エントリポイント (plugins/mysql-dialect/index.js)

import { mysqlConfig, mysqlMetadataDef } from './config.js';
import { createMysqlImporter } from './importer.js';
import { createMysqlExporter } from './exporter.js';
import { generateMysqlMigrationScripts } from './migration-generator.js';

export default {
  async activate(context) {
    const { BaseDialect } = context.api;
    const ejs = context.libs?.ejs;

    class MysqlDialect extends BaseDialect {
      constructor(config) {
        super(config);
        this.importer = createMysqlImporter(config, context);
        this.exporter = createMysqlExporter(config, ejs, context);
        this.migrationGenerator = (diffResult, targetTableNames, options) => {
          return generateMysqlMigrationScripts(diffResult, targetTableNames, config, options);
        };
      }
    }

    context.dialects.register(new MysqlDialect(mysqlConfig));
    context.metadata.registerAttributes(mysqlMetadataDef);
  },
};
