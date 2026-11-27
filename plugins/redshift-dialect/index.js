// 日本語コメント: Amazon Redshift 方言プラグイン エントリポイント (plugins/redshift-dialect/index.js)

import { redshiftConfig, redshiftMetadataDef } from './config.js';
import { createRedshiftImporter } from './importer.js';
import { createRedshiftExporter } from './exporter.js';
import { generateRedshiftMigrationScripts } from './migration-generator.js';

export default {
  async activate(context) {
    const { BaseDialect } = context.api;
    const ejs = context.libs?.ejs;

    class RedshiftDialect extends BaseDialect {
      constructor(config) {
        super(config);
        this.importer = createRedshiftImporter(config, context);
        this.exporter = createRedshiftExporter(config, ejs, context);
        this.migrationGenerator = (diffResult, targetTableNames, options) => {
          return generateRedshiftMigrationScripts(diffResult, targetTableNames, config, options);
        };
      }
    }

    context.dialects.register(new RedshiftDialect(redshiftConfig));
    context.metadata.registerAttributes(redshiftMetadataDef);
  },
};
