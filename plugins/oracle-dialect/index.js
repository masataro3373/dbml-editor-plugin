// 日本語コメント: Oracle 方言プラグイン エントリポイント (plugins/oracle-dialect/index.js)
// Oracle (12c+ / 11g) の方言登録、物理メタデータ属性登録、DDLインポーター/エクスポーター、マイグレーション生成エンジンを提供します。

import { oracle12cConfig, oracle11gConfig, oracleMetadataDef } from './config.js';
import { createOracleImporter } from './importer.js';
import { createOracleExporter } from './exporter.js';
import { generateOracleMigrationScripts } from './migration-generator.js';

export default {
  async activate(context) {
    const { BaseDialect } = context.api;
    const ejs = context.libs?.ejs;

    class OracleDialect extends BaseDialect {
      constructor(config) {
        super(config);
        this.importer = createOracleImporter(config, context);
        this.exporter = createOracleExporter(config, ejs, context);
        this.migrationGenerator = (diffResult, targetTableNames, options) => {
          return generateOracleMigrationScripts(diffResult, targetTableNames, config, options);
        };
      }
    }

    // 1. 方言 (12c+ / 11g) の登録
    context.dialects.register(new OracleDialect(oracle12cConfig));
    context.dialects.register(new OracleDialect(oracle11gConfig));

    // 2. 物理メタデータ属性（Project 表領域 3項目 + Table 物理属性 6項目）の登録
    context.metadata.registerAttributes(oracleMetadataDef);
  },
};

