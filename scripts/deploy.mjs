// 日本語コメント: プラグイン本体デプロイ用ヘルパースクリプト (scripts/deploy.mjs)
// 本スクリプトはビルド時に自動実行されるものではなく、
// dist/<plugin-id>-<version>.zip の生成物を本体 (dbml-editor-v2/plugins) へ反映したい場合に
// 開発者が手動で明示的に実行するための補助スクリプトです。
// 本体側に同一プラグインの旧バージョン ZIP が存在する場合は自動的に置換し、
// PluginsService の重複IDエラーを防止します。
//
// 使用方法:
//   node scripts/deploy.mjs                # dist 内の全 zip を v2/plugins へコピー
//   node scripts/deploy.mjs --all          # dist 内の全 zip を v2/plugins へコピー
//   node scripts/deploy.mjs logicalname    # logicalname の最新 zip のみコピー

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.resolve(projectRoot, 'dist');
const targetPluginsDir = path.resolve(projectRoot, '../dbml-editor-v2/plugins');

console.log('========================================================');
console.log('🚚 プラグインパッケージ 本体デプロイ (v2/plugins への反映)');
console.log(`ソース元:   ${distDir}`);
console.log(`デプロイ先: ${targetPluginsDir}`);
console.log('========================================================\n');

if (!fs.existsSync(distDir)) {
  console.error('❌ dist ディレクトリが存在しません。先に `npm run build` を実行してください。');
  process.exit(1);
}

const args = process.argv.slice(2);
const availableZips = fs.readdirSync(distDir).filter((f) => f.endsWith('.zip'));

if (availableZips.length === 0) {
  console.error('❌ dist 内に .zip ファイルが見つかりません。先に `npm run build` を実行してください。');
  process.exit(1);
}

/**
 * 日本語コメント: ZIP ファイル名からプラグインIDを抽出
 * 例: "logicalname-1.0.0.zip" -> "logicalname", "logicalname.zip" -> "logicalname"
 */
function extractPluginId(zipFileName) {
  const base = zipFileName.replace(/\.zip$/i, '');
  const lastHyphen = base.lastIndexOf('-');
  if (lastHyphen > 0 && /^[0-9]+\.[0-9]+(\.[0-9]+)?/.test(base.substring(lastHyphen + 1))) {
    return base.substring(0, lastHyphen);
  }
  return base;
}

let targets = [];

if (args.length === 0 || args.includes('--all') || args.includes('-a')) {
  targets = availableZips;
} else {
  for (const arg of args) {
    const matchedZips = availableZips.filter((f) => extractPluginId(f) === arg || f === arg || f === `${arg}.zip`);
    if (matchedZips.length > 0) {
      // 最新のものを対象に追加
      targets.push(...matchedZips);
    } else {
      console.error(`❌ 指定されたプラグイン '${arg}' の ZIP が dist 内に見つかりません。`);
      console.error(`   dist 内の ZIP: ${availableZips.join(', ')}`);
      process.exit(1);
    }
  }
}

if (!fs.existsSync(targetPluginsDir)) {
  fs.mkdirSync(targetPluginsDir, { recursive: true });
}

// 既存の targetPluginsDir 内のファイル一覧を取得
const existingTargetFiles = fs.readdirSync(targetPluginsDir);

for (const zipName of targets) {
  const pluginId = extractPluginId(zipName);
  const src = path.join(distDir, zipName);
  const dest = path.join(targetPluginsDir, zipName);

  // 同一プラグインの旧バージョン（またはバージョンなし zip）があれば事前に削除して重複を防止
  for (const existingFile of existingTargetFiles) {
    if (existingFile.endsWith('.zip') && extractPluginId(existingFile) === pluginId && existingFile !== zipName) {
      const oldFilePath = path.join(targetPluginsDir, existingFile);
      try {
        fs.unlinkSync(oldFilePath);
        console.log(`  🗑️  旧バージョンを削除しました: ${existingFile}`);
      } catch (e) {
        console.warn(`  ⚠️ 旧バージョン削除に失敗: ${existingFile} (${e.message})`);
      }
    }
  }

  fs.copyFileSync(src, dest);
  const stat = fs.statSync(dest);
  console.log(`  ✅ デプロイ完了: ${zipName} -> ${dest} (${stat.size} bytes)`);
}

console.log('\n========================================================');
console.log(`🎉 デプロイ完了: 全 ${targets.length} 件`);
console.log('========================================================\n');
