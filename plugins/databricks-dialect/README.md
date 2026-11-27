# Databricks SQL / Delta Lake 方言プラグイン (`databricks-dialect`) [Beta]

> **⚠️ Beta 版に関するご注意**: 本プラグインは実機（Databricks SQL 環境）での DDL 実行確認が未実施のベータ版です。出力された DDL やマイグレーション SQL は、必ず検証環境でご確認のうえご利用ください。

## 1. プラグイン概要
`databricks-dialect` は、`dbml-editor-v2` に対して **Databricks SQL / Delta Lake** の方言（Dialect）、Unity Catalog・Delta Lake 等の物理メタデータ属性、Databricks DDL のインポート・エクスポート、および Databricks 向けマイグレーション SQL 生成機能を提供する拡張プラグインです。

| 項目 | 内容 |
| :--- | :--- |
| **プラグイン ID** | `databricks-dialect` |
| **パッケージ名** | `databricks-dialect-1.0.0-beta.zip` |
| **バージョン** | `1.0.0-beta` |
| **提供機能 (`capabilities`)** | `dialect`, `metadata`, `importer`, `exporter`, `migration` |
| **必須ライブラリ (`requires`)** | `["ejs"]` |
| **実機検証状況** | 未検証（Beta 版） |

---

## 2. このプラグインが提供する機能

### 2.1. Databricks 方言 (`databricks`) とバリデーションルール
- **識別子の最大長**: **255 文字**
- **自動大文字変換**: 無効（入力ケースを保持）
- **データ型サジェスト**: `TINYINT`, `SMALLINT`, `INT`, `BIGINT`, `FLOAT`, `DOUBLE`, `DECIMAL`, `BOOLEAN`, `STRING`, `BINARY`, `DATE`, `TIMESTAMP`, `TIMESTAMP_NTZ`, `ARRAY<STRING>`, `MAP<STRING, STRING>`
- **新規カラム追加時のデフォルト型**: `STRING`（主キー時は `BIGINT`）
- **Databricks 予約語チェック**: 予約語と衝突する識別子の警告表示

### 2.2. 物理メタデータ属性 (`scope: 'dialect'`, `targetDialect: 'databricks'`)

#### テーブルレベル属性 (`tableAttributes`)
| 属性キー (`key`) | 型 | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| `catalog` | `string` | `''` | Unity Catalog カタログ名 |
| `schema` | `string` | `'default'` | スキーマ（データベース）名 |
| `using` | `select` | `'DELTA'` | テーブル形式（`DELTA` / `PARQUET` / `ORC`） |
| `partitioned_by` | `string` | `''` | パーティション列（`PARTITIONED BY (...)`） |
| `location` | `string` | `''` | 外部テーブル格納パス（`LOCATION '...'`） |

### 2.3. Databricks DDL インポーター (`importer`)
- `USING DELTA/PARQUET/...`、`PARTITIONED BY`、`TBLPROPERTIES`、`LOCATION`、`GENERATED ALWAYS AS IDENTITY` を前処理で標準 SQL 互換に変換し、DBML へ変換します。

### 2.4. Databricks DDL エクスポーター (`exporter`)
- `` `catalog`.`schema`.`table` `` 修飾、`GENERATED ALWAYS AS IDENTITY`、`DEFAULT` 句、インライン `COMMENT '...'`、`USING DELTA`、`PARTITIONED BY`、`LOCATION`、Unity Catalog 外部キー制約を含む DDL を生成します。

### 2.5. Databricks マイグレーション SQL 生成エンジン (`migrationGenerator`)
`RECREATE_TABLE` 時に以下の 4 ステップ構成で安全なマイグレーション SQL を生成します。
- `01_backup_table_<tbl>.sql`: 旧テーブルの退避リネーム（`ALTER TABLE ... RENAME TO`）
- `02_recreate_table_<tbl>.sql`: 新定義テーブル再作成（`USING DELTA`, `DEFAULT`, `COMMENT`, `PARTITIONED BY` 等対応）
- `03_data_copy_<tbl>.sql`: 退避テーブルからのデータ移行（追加カラムは `INSERT` に含め、`SELECT` 側へデフォルト値または `<<値をセット>>` を出力）
- `04_drop_backup_<tbl>.sql`: 退避テーブルの削除（`DROP TABLE IF EXISTS`）

---

## 3. パッケージ構成
```text
databricks-dialect/
├── README.md                 # 本ドキュメント（プラグイン説明書）
├── plugin.json               # プラグインマニフェスト
├── index.js                  # エントリポイント
├── config.js                 # Databricks ルール・物理属性定義
├── importer.js               # Databricks DDL インポーター
├── exporter.js               # Databricks DDL エクスポーター (ejs 使用)
├── ddl-template.js           # EJS 出力テンプレート
├── migration-generator.js    # Databricks マイグレーション SQL 生成器
└── locales/
    ├── en.json               # 英語翻訳リソース
    └── ja.json               # 日本語翻訳リソース
```

---

## 4. 動作要件・インストール方法
1. **必須ライブラリ**: 本体側（`context.libs`）に `ejs` が登録されている必要があります。
2. **ビルド・インストール**: `npm --prefix dbml-editor-plugin run build:databricks` で生成した ZIP を `dbml-editor-v2/plugins/` に配置します（または `npm --prefix dbml-editor-plugin run deploy` を実行）。
3. **アンインストール**: `dbml-editor-v2/plugins/databricks-dialect-1.0.0-beta.zip` を削除します。
