// 日本語コメント: Google Cloud Spanner 方言プラグイン エントリポイント (plugins/spanner-dialect/index.js)

import { spannerConfig, spannerMetadataDef } from './config.js';
import { createSpannerImporter } from './importer.js';
import { createSpannerExporter } from './exporter.js';
import { generateSpannerMigrationScripts } from './migration-generator.js';

export default {
  async activate(context) {
    const { BaseDialect } = context.api;
    const ejs = context.libs?.ejs;

    class SpannerDialect extends BaseDialect {
      constructor(config) {
        super(config);
        this.importer = createSpannerImporter(config, context);
        this.exporter = createSpannerExporter(config, ejs, context);
        this.migrationGenerator = (diffResult, targetTableNames, options) => {
          return generateSpannerMigrationScripts(diffResult, targetTableNames, config, options);
        };
      }
    }

    context.dialects.register(new SpannerDialect(spannerConfig));
    context.metadata.registerAttributes(spannerMetadataDef);
  },
};
