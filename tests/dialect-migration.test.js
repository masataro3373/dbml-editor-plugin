// 日本語コメント: 全方言プラグインのマイグレーション SQL 生成 (CREATE / RECREATE_TABLE / DROP) 自動テスト

import test from 'node:test';
import assert from 'node:assert/strict';
import { listPluginIds, loadAndActivatePlugin } from './helpers/plugin-driver.js';

/**
 * 日本語コメント: テスト用の差分モデル (CREATE / RECREATE_TABLE / DROP) を生成
 */
function createSampleDiffResult() {
  return {
    tables: [
      {
        name: 'new_items',
        status: 'ADDED',
        migrationMode: 'CREATE',
        newTable: {
          name: 'new_items',
          logicalName: '新規アイテム',
          fields: [
            { name: 'id', type: 'INT', pk: true, not_null: true, increment: true },
            { name: 'item_name', type: 'VARCHAR(100)', not_null: true, dbdefault: 'unnamed' },
          ],
          indexes: [],
        },
        alignedFks: [],
      },
      {
        name: 'users',
        status: 'MODIFIED',
        migrationMode: 'RECREATE_TABLE',
        oldTable: {
          name: 'users',
          logicalName: 'ユーザー',
          fields: [
            { name: 'id', type: 'INT', pk: true, not_null: true, increment: true },
            { name: 'name', type: 'VARCHAR(100)', not_null: true },
          ],
          indexes: [],
        },
        newTable: {
          name: 'users',
          logicalName: 'ユーザー',
          fields: [
            { name: 'id', type: 'INT', pk: true, not_null: true, increment: true },
            { name: 'name', type: 'VARCHAR(200)', not_null: true },
            { name: 'status', type: 'VARCHAR(20)', not_null: true, dbdefault: 'ACTIVE' },
            { name: 'department_id', type: 'INT', not_null: true },
          ],
          indexes: [],
        },
        alignedFks: [],
      },
      {
        name: 'legacy_logs',
        status: 'REMOVED',
        migrationMode: 'DROP',
        oldTable: {
          name: 'legacy_logs',
          fields: [{ name: 'id', type: 'INT', pk: true }],
        },
        alignedFks: [],
      },
    ],
  };
}

/**
 * 日本語コメント: テーブル名（大文字・小文字を区別せず）に一致するスクリプト配列を取得
 */
function getTableScripts(scriptsByTable, tableName) {
  const key = Object.keys(scriptsByTable).find(k => k.toLowerCase() === tableName.toLowerCase());
  return key ? scriptsByTable[key] : [];
}

const pluginIds = listPluginIds();

for (const pluginId of pluginIds) {
  test(`[${pluginId}] 方言プラグインのマイグレーション SQL 生成が正常に動作する`, async (t) => {
    const res = await loadAndActivatePlugin(pluginId);
    if (res.registeredDialects.length === 0) {
      t.skip('方言プラグインではないためスキップ');
      return;
    }

    const diffResult = createSampleDiffResult();

    for (const dialect of res.registeredDialects) {
      assert.equal(typeof dialect.migrationGenerator, 'function', `[${dialect.id}] migrationGenerator が関数ではありません`);
      const scriptsByTable = dialect.migrationGenerator(diffResult, [], {
        includeComment: true,
        commentSource: 'logicalName',
      });

      assert.ok(scriptsByTable && typeof scriptsByTable === 'object', `[${dialect.id}] 生成結果がオブジェクトではありません`);

      // 1. CREATE 検証
      const createScripts = getTableScripts(scriptsByTable, 'new_items');
      assert.ok(createScripts.length > 0, `[${dialect.id}] new_items の CREATE スクリプトが生成されていません`);
      assert.ok(createScripts.some(s => s.content.includes('CREATE TABLE')), `[${dialect.id}] new_items に CREATE TABLE が含まれていません`);

      // 2. RECREATE_TABLE 検証 (データ移行スクリプトの追加カラムデフォルト値・プレースホルダー含む)
      const recreateScripts = getTableScripts(scriptsByTable, 'users');
      assert.ok(recreateScripts.length > 0, `[${dialect.id}] users の RECREATE スクリプトが生成されていません`);
      const dataCopyScript = recreateScripts.find(s => s.filename.includes('data_copy'));
      if (dataCopyScript) {
        assert.ok(dataCopyScript.content.includes('ACTIVE'), `[${dialect.id}] 04_data_copy に追加カラムのデフォルト値 ACTIVE が含まれていません`);
        assert.ok(dataCopyScript.content.includes('<<値をセット>>'), `[${dialect.id}] 04_data_copy にデフォルト値なし追加カラムの <<値をセット>> が含まれていません`);
      }

      // 3. DROP 検証
      const dropScripts = getTableScripts(scriptsByTable, 'legacy_logs');
      assert.ok(dropScripts.length > 0, `[${dialect.id}] legacy_logs の DROP スクリプトが生成されていません`);
      assert.ok(dropScripts.some(s => s.content.includes('DROP TABLE')), `[${dialect.id}] legacy_logs に DROP TABLE が含まれていません`);
    }
  });
}
