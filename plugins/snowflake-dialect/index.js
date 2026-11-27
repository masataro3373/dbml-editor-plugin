// 日本語コメント: Snowflake 方言プラグイン エントリポイント (plugins/snowflake-dialect/index.js)

import { snowflakeConfig, snowflakeMetadataDef } from './config.js';
import { createSnowflakeImporter } from './importer.js';
import { createSnowflakeExporter } from './exporter.js';
import { generateSnowflakeMigrationScripts } from './migration-generator.js';

export default {
  async activate(context) {
    const { BaseDialect } = context.api;
    const ejs = context.libs?.ejs;

    class SnowflakeDialect extends BaseDialect {
      constructor(config) {
        super(config);
        this.importer = createSnowflakeImporter(config, context);
        this.exporter = createSnowflakeExporter(config, ejs, context);
        this.migrationGenerator = (diffResult, targetTableNames, options) => {
          return generateSnowflakeMigrationScripts(diffResult, targetTableNames, config, options);
        };
      }
    }

    context.dialects.register(new SnowflakeDialect(snowflakeConfig));
    context.metadata.registerAttributes(snowflakeMetadataDef);
  },
};
