// 日本語コメント: Databricks SQL / Delta Lake 方言プラグイン エントリポイント (plugins/databricks-dialect/index.js)

import { databricksConfig, databricksMetadataDef } from './config.js';
import { createDatabricksImporter } from './importer.js';
import { createDatabricksExporter } from './exporter.js';
import { generateDatabricksMigrationScripts } from './migration-generator.js';

export default {
  async activate(context) {
    const { BaseDialect } = context.api;
    const ejs = context.libs?.ejs;

    class DatabricksDialect extends BaseDialect {
      constructor(config) {
        super(config);
        this.importer = createDatabricksImporter(config, context);
        this.exporter = createDatabricksExporter(config, ejs, context);
        this.migrationGenerator = (diffResult, targetTableNames, options) => {
          return generateDatabricksMigrationScripts(diffResult, targetTableNames, config, options);
        };
      }
    }

    context.dialects.register(new DatabricksDialect(databricksConfig));
    context.metadata.registerAttributes(databricksMetadataDef);
  },
};
