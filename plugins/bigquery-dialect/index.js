// 日本語コメント: Google BigQuery 方言プラグイン エントリポイント (plugins/bigquery-dialect/index.js)

import { bigqueryConfig, bigqueryMetadataDef } from './config.js';
import { createBigqueryImporter } from './importer.js';
import { createBigqueryExporter } from './exporter.js';
import { generateBigqueryMigrationScripts } from './migration-generator.js';

export default {
  async activate(context) {
    const { BaseDialect } = context.api;
    const ejs = context.libs?.ejs;

    class BigqueryDialect extends BaseDialect {
      constructor(config) {
        super(config);
        this.importer = createBigqueryImporter(config, context);
        this.exporter = createBigqueryExporter(config, ejs, context);
        this.migrationGenerator = (diffResult, targetTableNames, options) => {
          return generateBigqueryMigrationScripts(diffResult, targetTableNames, config, options);
        };
      }
    }

    context.dialects.register(new BigqueryDialect(bigqueryConfig));
    context.metadata.registerAttributes(bigqueryMetadataDef);
  },
};
