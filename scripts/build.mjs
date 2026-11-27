// 日本語コメント: プラグイン共通ビルド＆パッケージングスクリプト (scripts/build.mjs)
// 外部ライブラリへの依存ゼロ (Node.js 標準モジュールのみ) で
// plugins/<plugin-id> 配下の全ファイルを無圧縮 STORE 形式 + CRC-32 付与の ZIP アーカイブとして生成し、
// dist/<plugin-id>-<version>.zip へ出力します。
// 生成後はインメモリで ZIP パースとマニフェスト・多言語辞書の整合性自動検証を実行します。
//
// 使用方法:
//   node scripts/build.mjs                  # 全プラグインを一括ビルド
//   node scripts/build.mjs --all            # 全プラグインを一括ビルド
//   node scripts/build.mjs logicalname      # logicalname のみビルド
//   node scripts/build.mjs erstudio-excel   # erstudio-excel のみビルド
//   node scripts/build.mjs oracle-dialect   # oracle-dialect のみビルド

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// プロジェクトルート・パス解決
const projectRoot = path.resolve(__dirname, '..');
const pluginsDir = path.resolve(projectRoot, 'plugins');
const distDir = path.resolve(projectRoot, 'dist');

/**
 * 日本語コメント: CRC-32 参照テーブルの事前生成 (多項式: 0xEDB88320)
 */
function createCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = createCrc32Table();

/**
 * 日本語コメント: バッファの CRC-32 チェックサムを高速計算
 * @param {Buffer} buffer - 計算対象のバイナリデータ
 * @returns {number} 32ビット符号なし整数
 */
function calculateCrc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 日本語コメント: 指定ディレクトリ配下の全ファイルを再帰走査して相対パスとファイル一覧を収集
 * @param {string} dir - 探索対象ディレクトリ
 * @param {string} base - 相対パスのベース
 * @returns {Array<{ relativePath: string, fullPath: string }>}
 */
function collectFilesRecursively(dir, base = '') {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...collectFilesRecursively(fullPath, relativePath));
    } else if (entry.isFile()) {
      results.push({ relativePath, fullPath });
    }
  }

  return results;
}

/**
 * 日本語コメント: 無圧縮 (STORE, Method 0) ZIP アーカイブ Buffer を生成
 * @param {Array<{ relativePath: string, data: Buffer }>} files - アーカイブに含めるファイル一覧
 * @returns {Buffer} 生成された ZIP バイナリデータ
 */
function buildStoreZip(files) {
  const localHeaderChunks = [];
  const centralDirectoryChunks = [];

  let currentOffset = 0;
  const cdEntries = [];

  // 1. 各ファイルの Local File Header および データ本体を構築
  for (const file of files) {
    const relativeName = file.relativePath.replace(/\\/g, '/');
    const nameBuffer = Buffer.from(relativeName, 'utf-8');
    const dataBuffer = file.data;
    const crc = calculateCrc32(dataBuffer);
    const size = dataBuffer.length;

    const localHeaderOffset = currentOffset;

    // Local File Header 固定部 30 バイト
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4);          // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0, 6);           // General purpose bit flag
    localHeader.writeUInt16LE(0, 8);           // Compression method (0 = STORE)
    localHeader.writeUInt16LE(0, 10);          // Last mod file time
    localHeader.writeUInt16LE(0, 12);          // Last mod file date
    localHeader.writeUInt32LE(crc, 14);         // CRC-32
    localHeader.writeUInt32LE(size, 18);        // Compressed size
    localHeader.writeUInt32LE(size, 22);        // Uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28);          // Extra field length

    localHeaderChunks.push(localHeader, nameBuffer, dataBuffer);
    currentOffset += localHeader.length + nameBuffer.length + dataBuffer.length;

    cdEntries.push({
      nameBuffer,
      crc,
      size,
      localHeaderOffset,
    });
  }

  // 2. Central Directory Header を構築
  const cdOffset = currentOffset;
  let cdSize = 0;

  for (const entry of cdEntries) {
    // Central Directory Header 固定部 46 バイト
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Central file header signature
    cdHeader.writeUInt16LE(20, 4);          // Version made by
    cdHeader.writeUInt16LE(20, 6);          // Version needed to extract
    cdHeader.writeUInt16LE(0, 8);           // General purpose bit flag
    cdHeader.writeUInt16LE(0, 10);          // Compression method (0 = STORE)
    cdHeader.writeUInt16LE(0, 12);          // Last mod file time
    cdHeader.writeUInt16LE(0, 14);          // Last mod file date
    cdHeader.writeUInt32LE(entry.crc, 16);  // CRC-32
    cdHeader.writeUInt32LE(entry.size, 20); // Compressed size
    cdHeader.writeUInt32LE(entry.size, 24); // Uncompressed size
    cdHeader.writeUInt16LE(entry.nameBuffer.length, 28); // File name length
    cdHeader.writeUInt16LE(0, 30);          // Extra field length
    cdHeader.writeUInt16LE(0, 32);          // File comment length
    cdHeader.writeUInt16LE(0, 34);          // Disk number start
    cdHeader.writeUInt16LE(0, 36);          // Internal file attributes
    cdHeader.writeUInt32LE(0, 38);          // External file attributes
    cdHeader.writeUInt32LE(entry.localHeaderOffset, 42); // Relative offset of local header

    centralDirectoryChunks.push(cdHeader, entry.nameBuffer);
    cdSize += cdHeader.length + entry.nameBuffer.length;
  }

  // 3. End of Central Directory Record (EOCD) 固定部 22 バイト
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);       // EOCD signature
  eocd.writeUInt16LE(0, 4);                // Number of this disk
  eocd.writeUInt16LE(0, 6);                // Disk where central directory starts
  eocd.writeUInt16LE(cdEntries.length, 8); // Number of central directory records on this disk
  eocd.writeUInt16LE(cdEntries.length, 10); // Total number of central directory records
  eocd.writeUInt32LE(cdSize, 12);          // Size of central directory
  eocd.writeUInt32LE(cdOffset, 16);        // Offset of start of central directory
  eocd.writeUInt16LE(0, 20);               // Comment length

  return Buffer.concat([...localHeaderChunks, ...centralDirectoryChunks, eocd]);
}

/**
 * 日本語コメント: 単一プラグインのビルドおよびインメモリ自己検証
 * @param {string} pluginId - プラグインディレクトリ名
 */
function buildPlugin(pluginId) {
  const pluginSrcDir = path.join(pluginsDir, pluginId);

  if (!fs.existsSync(pluginSrcDir) || !fs.statSync(pluginSrcDir).isDirectory()) {
    throw new Error(`プラグインディレクトリが見つかりません: ${pluginSrcDir}`);
  }

  // ファイル収集
  const fileItems = collectFilesRecursively(pluginSrcDir);
  if (fileItems.length === 0) {
    throw new Error(`ディレクトリ内にファイルが存在しません: ${pluginSrcDir}`);
  }

  const filesForZip = fileItems.map((item) => {
    const data = fs.readFileSync(item.fullPath);
    return {
      relativePath: item.relativePath,
      data,
    };
  });

  // 必須ファイルの存在確認
  const requiredFiles = ['plugin.json', 'index.js', 'locales/en.json'];
  for (const req of requiredFiles) {
    if (!filesForZip.some((f) => f.relativePath === req)) {
      throw new Error(`必須ファイル '${req}' が存在しません`);
    }
  }

  // plugin.json 構文＆バージョン取得
  const manifestFile = filesForZip.find((f) => f.relativePath === 'plugin.json');
  const manifest = JSON.parse(manifestFile.data.toString('utf-8'));
  assert(manifest.id, 'plugin.json に id が定義されていません');
  assert(manifest.name, 'plugin.json に name が定義されていません');
  assert(manifest.version, 'plugin.json に version が定義されていません');
  assert(manifest.entry, 'plugin.json に entry が定義されていません');

  // バージョン番号付きの ZIP ファイル名
  const zipFileName = `${pluginId}-${manifest.version}.zip`;
  const outputZipPath = path.join(distDir, zipFileName);

  console.log(`\n--------------------------------------------------------`);
  console.log(`📦 プラグインビルド開始: [${pluginId}] v${manifest.version}`);
  console.log(`  ソース: ${pluginSrcDir}`);
  console.log(`  出力先: ${outputZipPath}`);

  console.log(`  読み込みファイル数: ${filesForZip.length} 件`);
  for (const f of filesForZip) {
    console.log(`    - ${f.relativePath} (${f.data.length} bytes)`);
  }

  // ZIP生成
  const zipBuffer = buildStoreZip(filesForZip);

  // dist ディレクトリへ書き出し
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  fs.writeFileSync(outputZipPath, zipBuffer);
  console.log(`  ✅ ZIP生成完了: ${outputZipPath} (${zipBuffer.length} bytes)`);

  // インメモリ検証 (EOCD & Central Directory パース)
  console.log(`  🔍 ZIPバイナリ整合性自己検証中...`);
  const entriesMap = new Map();
  const len = zipBuffer.length;
  let eocdOffset = -1;
  const maxSearch = Math.min(len, 65535 + 22);
  for (let i = len - 22; i >= len - maxSearch; i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  assert(eocdOffset !== -1, 'EOCD シグネチャが見つかりません');

  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  let pos = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    const sig = zipBuffer.readUInt32LE(pos);
    assert.strictEqual(sig, 0x02014b50, 'Central directory header signature 不正');
    const fileNameLength = zipBuffer.readUInt16LE(pos + 28);
    const extraFieldLength = zipBuffer.readUInt16LE(pos + 30);
    const fileCommentLength = zipBuffer.readUInt16LE(pos + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(pos + 42);

    const name = zipBuffer.toString('utf-8', pos + 46, pos + 46 + fileNameLength).replace(/\\/g, '/');
    entriesMap.set(name, localHeaderOffset);

    pos += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  assert.strictEqual(entriesMap.size, filesForZip.length, 'エントリ数が一致しません');

  // locales/en.json, ja.json 構文チェック
  const enFile = filesForZip.find((f) => f.relativePath === 'locales/en.json');
  JSON.parse(enFile.data.toString('utf-8'));

  const jaFile = filesForZip.find((f) => f.relativePath === 'locales/ja.json');
  if (jaFile) {
    JSON.parse(jaFile.data.toString('utf-8'));
  }

  console.log(`  -> 自己検証 PASS ✅ (ID: ${manifest.id}, Ver: ${manifest.version}, 名前: ${manifest.name})`);
}

// ========================================================
// コマンドライン引数解析とメイン実行
// ========================================================
console.log('========================================================');
console.log('🚀 DBML Editor プラグイン パッケージャー');
console.log('========================================================');

const args = process.argv.slice(2);
let targets = [];

// 利用可能なプラグイン一覧を取得
const availablePlugins = fs.readdirSync(pluginsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (args.length === 0 || args.includes('--all') || args.includes('-a')) {
  targets = availablePlugins;
  console.log(`全プラグイン一括ビルドモード: [${targets.join(', ')}]`);
} else {
  for (const arg of args) {
    if (availablePlugins.includes(arg)) {
      targets.push(arg);
    } else {
      console.error(`\n❌ 指定されたプラグイン '${arg}' は見つかりません。`);
      console.error(`   利用可能なプラグイン: ${availablePlugins.join(', ')}`);
      process.exit(1);
    }
  }
  console.log(`指定プラグインビルドモード: [${targets.join(', ')}]`);
}

try {
  let successCount = 0;
  for (const target of targets) {
    buildPlugin(target);
    successCount++;
  }

  console.log('\n========================================================');
  console.log(`🎉 プラグインビルド完了: 全 ${successCount} 件 正常終了`);
  console.log(`📂 出力先ディレクトリ: ${distDir}`);
  console.log('========================================================\n');
} catch (err) {
  console.error('\n❌ ビルド中にエラーが発生しました:', err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
}
