// 日本語コメント: 公式プラグイン ZIP パッケージャースクリプト (dbml-editor-plugin/scripts/pack-plugins.mjs)
// 外部ライブラリ（archiver 等）を一切使わず、Node.js 組み込み (fs, zlib, path) のみで
// dbml-editor-plugin/plugins/ 配下の各プラグインディレクトリを .zip に固め、
// dbml-editor-v2/plugins/ ディレクトリへ出力します。

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CRC-32 テーブル生成
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

function calculateCrc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * ディレクトリを再帰的に走査して相対パスと Buffer のリストを取得
 */
function collectFiles(dirPath, rootDir = dirPath) {
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, rootDir));
    } else if (entry.isFile()) {
      // .git などの不要なファイルは除外
      if (entry.name.startsWith('.git') || entry.name.endsWith('.DS_Store')) continue;
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      const data = fs.readFileSync(fullPath);
      results.push({ relPath, data });
    }
  }

  return results;
}

/**
 * ファイルリストから純粋な ZIP Buffer を生成 (ZIP-32 標準仕様準拠)
 */
function createZipBuffer(fileEntries = []) {
  const localHeaders = [];
  const centralHeaders = [];
  let currentOffset = 0;

  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  for (const file of fileEntries) {
    const filenameBuf = Buffer.from(file.relPath, 'utf8');
    const crc = calculateCrc32(file.data);
    const uncompressedSize = file.data.length;

    // Deflate 圧縮 (ヘッダー/フッター無しの raw deflate)
    const compressedData = zlib.deflateRawSync(file.data);
    const compressedSize = compressedData.length;

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);         // version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // flags (bit 11 = UTF-8)
    localHeader.writeUInt16LE(8, 8);          // compression method (deflate)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(filenameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);         // extra field length
    filenameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader);
    localHeaders.push(compressedData);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46 + filenameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4);         // version made by
    centralHeader.writeUInt16LE(20, 6);         // version needed
    centralHeader.writeUInt16LE(0x0800, 8);     // flags (UTF-8)
    centralHeader.writeUInt16LE(8, 10);         // method
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(filenameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);         // extra field length
    centralHeader.writeUInt16LE(0, 32);         // comment length
    centralHeader.writeUInt16LE(0, 34);         // disk number start
    centralHeader.writeUInt16LE(0, 36);         // internal attrs
    centralHeader.writeUInt32LE(0, 38);         // external attrs
    centralHeader.writeUInt32LE(currentOffset, 42); // relative offset of local header
    filenameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);

    currentOffset += localHeader.length + compressedData.length;
  }

  const centralDirOffset = currentOffset;
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);           // signature
  eocd.writeUInt16LE(0, 4);                    // disk number
  eocd.writeUInt16LE(0, 6);                    // disk with start of central directory
  eocd.writeUInt16LE(fileEntries.length, 8);    // total entries on this disk
  eocd.writeUInt16LE(fileEntries.length, 10);   // total entries
  eocd.writeUInt32LE(centralDirSize, 12);       // size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16);     // offset of start of central directory
  eocd.writeUInt16LE(0, 20);                   // zip file comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

// メインビルド処理
const pluginsSourceDir = path.resolve(__dirname, '../plugins');
const outputDir = path.resolve(__dirname, '../../dbml-editor-v2/plugins');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('📦 公式プラグイン ZIP パッケージング開始...\n');
console.log(`ソースディレクトリ: ${pluginsSourceDir}`);
console.log(`出力先ディレクトリ: ${outputDir}\n`);

const pluginDirs = fs.readdirSync(pluginsSourceDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

for (const pluginId of pluginDirs) {
  const pluginDirPath = path.join(pluginsSourceDir, pluginId);
  const manifestPath = path.join(pluginDirPath, 'plugin.json');

  if (!fs.existsSync(manifestPath)) {
    console.warn(`⚠️ スキップ: ${pluginId} (plugin.json が存在しません)`);
    continue;
  }

  const files = collectFiles(pluginDirPath);
  const zipBuffer = createZipBuffer(files);
  const zipFileName = `${pluginId}.zip`;
  const outPath = path.join(outputDir, zipFileName);

  fs.writeFileSync(outPath, zipBuffer);
  console.log(`  ✅ パッケージ生成: ${zipFileName} (${(zipBuffer.length / 1024).toFixed(1)} KB, ファイル数: ${files.length})`);
}

console.log('\n🎉 すべての公式プラグインの ZIP パッケージ化が完了しました！\n');

