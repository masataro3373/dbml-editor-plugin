// 日本語コメント: ER/Studio Excel 設計書プラグイン エントリポイント (plugins/erstudio-excel/index.js)
// テーブル・カラムの論理名機能の有効化、ER/Studio 設計メタデータ属性、25列 Excel インポーターを登録します。

import { erStudioMetadataDef } from './config.js';
import { createErStudioExcelImporter } from './excel-importer.js';

export default {
  async activate(context) {
    // 1. メタデータ属性定義（enableLogicalName: true, Table 3項目, Column 8項目）の登録
    context.metadata.registerAttributes(erStudioMetadataDef);

    // 2. 独立 Excel 設計書インポーターの登録
    const importer = createErStudioExcelImporter(context);
    context.importers.register(importer);
  },
};

