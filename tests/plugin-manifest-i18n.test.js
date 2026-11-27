// 日本語コメント: 全プラグインのマニフェスト(plugin.json)と多言語辞書(locales/*.json)の整合性テスト

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listPluginIds,
  readPluginManifest,
  readPluginLocale,
  loadAndActivatePlugin,
} from './helpers/plugin-driver.js';

/**
 * 日本語コメント: ドット区切りキー (例: "attributes.schema") が辞書オブジェクトに存在するか確認
 */
function hasNestedKey(obj, dotKey) {
  if (!obj || typeof dotKey !== 'string') return false;
  const parts = dotKey.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object' || !(part in cur)) {
      return false;
    }
    cur = cur[part];
  }
  return typeof cur === 'string' && cur.trim().length > 0;
}

const pluginIds = listPluginIds();

test('プラグインが1件以上存在する', () => {
  assert.ok(pluginIds.length > 0, 'plugins/ ディレクトリが空です');
});

for (const pluginId of pluginIds) {
  test(`[${pluginId}] plugin.json の必須項目と形式が正しい`, () => {
    const manifest = readPluginManifest(pluginId);
    assert.equal(manifest.id, pluginId, 'plugin.json の id がディレクトリ名と一致しません');
    assert.equal(typeof manifest.name, 'string');
    assert.ok(manifest.name.trim().length > 0, 'name が空です');
    assert.equal(typeof manifest.version, 'string');
    assert.equal(typeof manifest.entry, 'string');
    assert.ok(Array.isArray(manifest.capabilities), 'capabilities は配列である必要があります');
  });

  test(`[${pluginId}] locales/ja.json と en.json にトップレベルの name / description が存在する`, () => {
    for (const lang of ['ja', 'en']) {
      const locale = readPluginLocale(pluginId, lang);
      assert.ok(locale, `locales/${lang}.json が存在しません`);
      assert.equal(typeof locale.name, 'string', `locales/${lang}.json にトップレベル name がありません`);
      assert.ok(locale.name.trim().length > 0, `locales/${lang}.json の name が空です`);
      assert.equal(typeof locale.description, 'string', `locales/${lang}.json にトップレベル description がありません`);
      assert.ok(locale.description.trim().length > 0, `locales/${lang}.json の description が空です`);
    }
  });

  test(`[${pluginId}] 登録されたメタデータ属性の labelKey / hintKey が ja.json / en.json に存在する`, async () => {
    const { registeredMetadata } = await loadAndActivatePlugin(pluginId);
    const ja = readPluginLocale(pluginId, 'ja');
    const en = readPluginLocale(pluginId, 'en');

    for (const entry of registeredMetadata) {
      const def = entry.def || {};
      const attrGroups = [
        ...(def.projectAttributes || []),
        ...(def.tableAttributes || []),
        ...(def.columnAttributes || []),
      ];
      for (const attr of attrGroups) {
        if (attr.labelKey) {
          assert.ok(hasNestedKey(ja, attr.labelKey), `ja.json にキー "${attr.labelKey}" がありません`);
          assert.ok(hasNestedKey(en, attr.labelKey), `en.json にキー "${attr.labelKey}" がありません`);
        }
        if (attr.hintKey) {
          assert.ok(hasNestedKey(ja, attr.hintKey), `ja.json にキー "${attr.hintKey}" がありません`);
          assert.ok(hasNestedKey(en, attr.hintKey), `en.json にキー "${attr.hintKey}" がありません`);
        }
      }
    }
  });
}
