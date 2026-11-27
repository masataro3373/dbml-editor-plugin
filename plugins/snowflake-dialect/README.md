# Snowflake 方言プラグイン (`snowflake-dialect`) [Beta]

> **⚠️ Beta 版に関するご注意**: 本プラグインは実機（Snowflake 環境）での DDL 実行確認が未実施のベータ版です。出力された DDL やマイグレーション SQL は、必ず検証環境でご確認のうえご利用ください。

## 1. プラグイン概要
`snowflake-dialect` は、`dbml-editor-v2` に対して **Snowflake** の方言（Dialect）、クラスタリング・データ保持日数等の物理メタデータ属性、Snowflake DDL のインポート・エクスポート、および Snowflake 向けマイグレーション SQL 生成機能を提供する拡張プラグインです。

| 項目 | 内容 |
| :--- | :--- |
| **プラグイン ID** | `snowflake-dialect` |
| **パッケージ名** | `snowflake-dialect-1.0.0-beta.zip` |
| **バージョン** | `1.0.0-beta` |
| **提供機能 (`capabilities`)** | `dialect`, `metadata`, `importer`, `exporter`, `migration` |
| **必須ライブラリ (`requires`)** | `["ejs"]` |
| **実機検証状況** | 未検証（Beta 版） |

---

## 2. このプラグインが提供する機能

### 2.1. Snowflake 方言 (`snowflake`) とバリデーションルール
- **識別子の最大長**: **255 文字**
- **自動大文字変換**: 有効（`autoConvertUpper: true`）
- **データ型サジェスト**: `NUMBER`, `INTEGER`, `BIGINT`, `FLOAT`, `VARCHAR`, `STRING`, `BOOLEAN`, `DATE`, `TIME`, `TIMESTAMP_NTZ`, `TIMESTAMP_LTZ`, `TIMESTAMP_TZ`, `BINARY`, `VARIANT`, `OBJECT`, `ARRAY`
- **新規カラム追加時のデフォルト型**: `VARCHAR(255)`（主キー時は `NUMBER(38,0)`）
- **Snowflake 予約語チェック**: 予約語と衝突する識別子の警告表示

### 2.2. 物理メタデータ属性 (`scope: 'dialect'`, `targetDialect: 'snowflake'`)

#### テーブルレベル属性 (`tableAttributes`)
| 属性キー (`key`) | 型 | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| `schema` | `string` | `''` | スキーマ名（例: `PUBLIC`） |
| `cluster_by` | `string` | `''` | クラスタリングキー（`CLUSTER BY (...)`） |
| `data_retention_time_in_days` | `number` | `''` | Time Travel 用データ保持日数（`DATA_RETENTION_TIME_IN_DAYS`） |

### 2.3. Snowflake DDL インポーター (`importer`)
- `CLUSTER BY (...)`、`DATA_RETENTION_TIME_IN_DAYS`、`COPY GRANTS`、`CREATE OR REPLACE TABLE` 等を前処理で正規化し、`snowflake` 形式で DBML へ変換します。

### 2.4. Snowflake DDL エクスポーター (`exporter`)
- ダブルクォート（`"..."`）引用、`AUTOINCREMENT`、`DEFAULT` 句、インライン `COMMENT '...'`、`CLUSTER BY`、`DATA_RETENTION_TIME_IN_DAYS`、テーブル `COMMENT = '...'` を含む Snowflake DDL を生成します。

### 2.5. Snowflake マイグレーション SQL 生成エンジン (`migrationGenerator`)
`RECREATE_TABLE` 時に Snowflake の `SWAP WITH` を活かした 4 ステップ構成で安全にテーブルを切り替えます。
- `01_create_staging_table_<tbl>.sql`: 新定義のステージングテーブルを作成
- `02_data_copy_<tbl>.sql`: 現行テーブルからステージングテーブルへデータ移行（追加カラムは `INSERT` に含め、`SELECT` 側へデフォルト値または `<<値をセット>>` を出力）
- `03_swap_table_<tbl>.sql`: `ALTER TABLE ... SWAP WITH ...` によるアトミック切り替えと旧テーブルの退避リネーム
- `04_drop_backup_<tbl>.sql`: 退避テーブルの削除

---

## 3. パッケージ構成
```text
snowflake-dialect/
├── README.md                 # 本ドキュメント（プラグイン説明書）
├── plugin.json               # プラグインマニフェスト
├── index.js                  # エントリポイント
├── config.js                 # Snowflake ルール・物理属性定義
├── importer.js               # Snowflake DDL インポーター
├── exporter.js               # Snowflake DDL エクスポーター (ejs 使用)
├── ddl-template.js           # EJS 出力テンプレート
├── migration-generator.js    # Snowflake マイグレーション SQL 生成器
└── locales/
    ├── en.json               # 英語翻訳リソース
    └── ja.json               # 日本語翻訳リソース
```

---

## 4. 動作要件・インストール方法
1. **必須ライブラリ**: 本体側（`context.libs`）に `ejs` が登録されている必要があります。
2. **ビルド・インストール**: `npm --prefix dbml-editor-plugin run build:snowflake` で生成した ZIP を `dbml-editor-v2/plugins/` に配置します（または `npm --prefix dbml-editor-plugin run deploy` を実行）。
3. **アンインストール**: `dbml-editor-v2/plugins/snowflake-dialect-1.0.0-beta.zip` を削除します。
