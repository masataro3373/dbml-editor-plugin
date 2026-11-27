// 日本語コメント: プラグイン単体テスト用スタブ＆ドライバ (tests/helpers/plugin-driver.js)
// dbml-editor-v2 本体に依存せず、dbml-editor-plugin 単体でプラグインのロード・実行・検証を行います。

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const pluginRootDir = path.resolve(__dirname, '../..');
export const pluginsDir = path.resolve(pluginRootDir, 'plugins');

/**
 * 日本語コメント: テスト用 BaseDialect スタブクラス
 */
export class StubBaseDialect {
  constructor(config = {}) {
    this.config = config;
    this.id = config.id || '';
    this.displayName = config.displayName || config.id || '';
    this.importer = null;
    this.exporter = null;
    this.migrationGenerator = null;
  }
}

/**
 * 日本語コメント: テスト用 BaseImporter スタブクラス
 */
export class StubBaseImporter {
  constructor(config = {}) {
    this.config = config;
  }
}

/**
 * 日本語コメント: テスト用 BaseExporter スタブクラス
 */
export class StubBaseExporter {
  constructor(config = {}) {
    this.config = config;
  }
}

let cachedEjs = null;

/**
 * 日本語コメント: EJS ライブラリをロード（plugin 側 node_modules 優先、無ければワークスペース内 v2 へフォールバック）
 */
export async function loadEjsLib() {
  if (cachedEjs) return cachedEjs;
  try {
    cachedEjs = require('ejs');
    return cachedEjs;
  } catch {
    const fallbackPath = path.resolve(pluginRootDir, '../dbml-editor-v2/node_modules/ejs');
    if (fs.existsSync(fallbackPath)) {
      cachedEjs = require(fallbackPath);
      return cachedEjs;
    }
    return null;
  }
}

/**
 * 日本語コメント: プラグイン activate(context) に渡すモックコンテキスト（スタブ）を生成
 */
export function createPluginContextStub(pluginId, libs = {}) {
  const registeredDialects = [];
  const registeredImporters = [];
  const registeredExporters = [];
  const registeredMetadata = [];

  const context = {
    pluginId,
    api: {
      BaseDialect: StubBaseDialect,
      BaseImporter: StubBaseImporter,
      BaseExporter: StubBaseExporter,
    },
    libs: {
      ejs: libs.ejs || null,
      xlsx: libs.xlsx || null,
    },
    dialects: {
      register(dialect) {
        registeredDialects.push(dialect);
      },
    },
    importers: {
      register(importer) {
        registeredImporters.push(importer);
      },
    },
    exporters: {
      register(exporter) {
        registeredExporters.push(exporter);
      },
    },
    metadata: {
      registerAttributes(...args) {
        if (args.length >= 2 && typeof args[0] === 'string') {
          registeredMetadata.push({ scopeId: args[0], def: args[1] });
        } else if (args.length >= 1) {
          registeredMetadata.push({ scopeId: pluginId, def: args[0] });
        }
      },
    },
    i18n: {
      t(key) {
        return key;
      },
    },
  };

  return {
    context,
    registeredDialects,
    registeredImporters,
    registeredExporters,
    registeredMetadata,
  };
}

/**
 * 日本語コメント: plugins/ 配下の全プラグインディレクトリ一覧を取得
 */
export function listPluginIds() {
  return fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .sort();
}

/**
 * 日本語コメント: 指定プラグインのマニフェスト(plugin.json)を読み込む
 */
export function readPluginManifest(pluginId) {
  const manifestPath = path.resolve(pluginsDir, pluginId, 'plugin.json');
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * 日本語コメント: 指定プラグインのロケール辞書(ja.json / en.json)を読み込む
 */
export function readPluginLocale(pluginId, lang) {
  const localePath = path.resolve(pluginsDir, pluginId, 'locales', `${lang}.json`);
  if (!fs.existsSync(localePath)) return null;
  const raw = fs.readFileSync(localePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * 日本語コメント: テストドライバ — プラグインを動的ロードして activate() を実行し登録結果を返す
 */
export async function loadAndActivatePlugin(pluginId) {
  const manifest = readPluginManifest(pluginId);
  const entryPath = path.resolve(pluginsDir, pluginId, manifest.entry || 'index.js');
  const mod = await import(pathToFileURL(entryPath).href);
  const pluginObj = mod.default || mod;

  if (!pluginObj || typeof pluginObj.activate !== 'function') {
    throw new Error(`プラグイン [${pluginId}] に activate(context) 関数が定義されていません`);
  }

  const ejs = await loadEjsLib();
  const stub = createPluginContextStub(pluginId, { ejs });
  await pluginObj.activate(stub.context);

  return {
    pluginId,
    manifest,
    ...stub,
  };
}
