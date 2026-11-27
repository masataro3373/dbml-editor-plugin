// 日本語コメント: 全プラグインの動的ロードおよび activate(context) の正常終了テスト

import test from 'node:test';
import assert from 'node:assert/strict';
import { listPluginIds, loadAndActivatePlugin } from './helpers/plugin-driver.js';

const pluginIds = listPluginIds();

for (const pluginId of pluginIds) {
  test(`[${pluginId}] index.js のロードおよび activate(context) がエラーなく完了する`, async () => {
    const res = await loadAndActivatePlugin(pluginId);
    const caps = res.manifest.capabilities || [];

    if (caps.includes('dialect')) {
      assert.ok(res.registeredDialects.length > 0, 'dialect capability があるのに方言が登録されていません');
      for (const dialect of res.registeredDialects) {
        assert.ok(dialect.config?.id, '方言 config.id が未設定です');
        assert.ok(dialect.config?.displayName, '方言 config.displayName が未設定です');
        if (caps.includes('importer')) {
          assert.ok(dialect.importer, `方言 [${dialect.config.id}] に importer が未設定です`);
        }
        if (caps.includes('exporter')) {
          assert.ok(dialect.exporter, `方言 [${dialect.config.id}] に exporter が未設定です`);
        }
        if (caps.includes('migration')) {
          assert.equal(typeof dialect.migrationGenerator, 'function', `方言 [${dialect.config.id}] に migrationGenerator が未設定です`);
        }
      }
    }

    if (caps.includes('metadata')) {
      assert.ok(res.registeredMetadata.length > 0, 'metadata capability があるのに属性が登録されていません');
    }
  });
}
