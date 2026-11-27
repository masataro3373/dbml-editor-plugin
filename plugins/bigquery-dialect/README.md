# Google BigQuery 方言プラグイン (`bigquery-dialect`) [Beta]

> **⚠️ Beta 版に関するご注意**: 本プラグインは実機（Google BigQuery 環境）での DDL 実行確認が未実施のベータ版です。出力された DDL やマイグレーション SQL は、必ず検証環境（BigQuery Sandbox 等）でご確認のうえご利用ください。

## 1. プラグイン概要
`bigquery-dialect` は、`dbml-editor-v2` に対して **Google BigQuery** の方言（Dialect）、データセット・パーティション・クラスタリング等の物理メタデータ属性、BigQuery DDL のインポート・エクスポート、および BigQuery 向けマイグレーション SQL 生成機能を提供する拡張プラグインです。

| 項目 | 内容 |
| :--- | :--- |
| **プラグイン ID** | `bigquery-dialect` |
| **パッケージ名** | `bigquery-dialect-1.0.0-beta.zip` |
| **バージョン** | `1.0.0-beta` |
| **提供機能 (`capabilities`)** | `dialect`, `metadata`, `importer`, `exporter`, `migration` |
| **必須ライブラリ (`requires`)** | `["ejs"]` |
| **実機検証状況** | 未検証（Beta 版） |

---

## 2. このプラグインが提供する機能

### 2.1. Google BigQuery 方言 (`bigquery`) とバリデーションルール
- **識別子の最大長**: **1024 文字**
- **自動大文字変換**: 無効（入力ケースを保持）
- **データ型サジェスト**: `STRING`, `INT64`, `FLOAT64`, `NUMERIC`, `BIGNUMERIC`, `BOOL`, `DATE`, `DATETIME`, `TIME`, `TIMESTAMP`, `BYTES`, `JSON`, `GEOGRAPHY`
- **新規カラム追加時のデフォルト型**: `STRING`（主キー時は `INT64`）
- **BigQuery 予約語チェック**: 予約語と衝突する識別子の警告表示

### 2.2. 物理メタデータ属性 (`scope: 'dialect'`, `targetDialect: 'bigquery'`)

#### テーブルレベル属性 (`tableAttributes`)
| 属性キー (`key`) | 型 | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| `dataset` | `string` | `'my_dataset'` | データセット名（`` `dataset.table` `` の修飾に使用） |
| `partition_by` | `string` | `''` | パーティション式（例: `DATE(created_at)` → `PARTITION BY ...`） |
| `cluster_by` | `string` | `''` | クラスタリング列（`CLUSTER BY ...`） |

### 2.3. BigQuery DDL インポーター (`importer`)
- `OPTIONS(...)`、`PARTITION BY`、`CLUSTER BY`、`NOT ENFORCED`、`` `dataset.table` `` 修飾を前処理でクレンジングし、DBML へ変換します。

### 2.4. BigQuery DDL エクスポーター (`exporter`)
- バッククォート（`` `dataset.table` ``）引用、`DEFAULT` 句、`OPTIONS(description="...")` によるテーブル/カラム説明、`PARTITION BY` / `CLUSTER BY`、`PRIMARY KEY (...) NOT ENFORCED` / `FOREIGN KEY ... NOT ENFORCED` を含む BigQuery DDL を生成します。

### 2.5. BigQuery マイグレーション SQL 生成エンジン (`migrationGenerator`)
`RECREATE_TABLE` 時に BigQuery の `CLONE` を用いた 4 ステップ構成で安全にマイグレーション SQL を生成します。
- `01_backup_table_<tbl>.sql`: `CREATE TABLE ... CLONE ...` によるゼロコピー退避および旧テーブル削除
- `02_recreate_table_<tbl>.sql`: 新定義テーブル再作成（`DEFAULT` 句・`PARTITION BY` / `CLUSTER BY` / `OPTIONS` 対応）
- `03_data_copy_<tbl>.sql`: 退避テーブルからのデータ移行（追加カラムは `INSERT` に含め、`SELECT` 側へデフォルト値または `<<値をセット>>` を出力）
- `04_drop_backup_<tbl>.sql`: 退避テーブルの削除

---

## 3. パッケージ構成
```text
bigquery-dialect/
├── README.md                 # 本ドキュメント（プラグイン説明書）
├── plugin.json               # プラグインマニフェスト
├── index.js                  # エントリポイント
├── config.js                 # BigQuery ルール・物理属性定義
├── importer.js               # BigQuery DDL インポーター
├── exporter.js               # BigQuery DDL エクスポーター (ejs 使用)
├── ddl-template.js           # EJS 出力テンプレート
├── migration-generator.js    # BigQuery マイグレーション SQL 生成器
└── locales/
    ├── en.json               # 英語翻訳リソース
    └── ja.json               # 日本語翻訳リソース
```

---

## 4. 動作要件・インストール方法
1. **必須ライブラリ**: 本体側（`context.libs`）に `ejs` が登録されている必要があります。
2. **ビルド・インストール**: `npm --prefix dbml-editor-plugin run build:bigquery` で生成した ZIP を `dbml-editor-v2/plugins/` に配置します（または `npm --prefix dbml-editor-plugin run deploy` を実行）。
3. **アンインストール**: `dbml-editor-v2/plugins/bigquery-dialect-1.0.0-beta.zip` を削除します。
