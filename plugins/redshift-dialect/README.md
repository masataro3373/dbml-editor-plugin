# Amazon Redshift 方言プラグイン (`redshift-dialect`) [Beta]

> **⚠️ Beta 版に関するご注意**: 本プラグインは実機（Amazon Redshift 環境）での DDL 実行確認が未実施のベータ版です。出力された DDL やマイグレーション SQL は、必ず検証環境でご確認のうえご利用ください。

## 1. プラグイン概要
`redshift-dialect` は、`dbml-editor-v2` に対して **Amazon Redshift** の方言（Dialect）、分散・ソートキー（`DISTSTYLE`, `DISTKEY`, `SORTKEY`）等の物理メタデータ属性、Redshift DDL のインポート・エクスポート、および Redshift 向けマイグレーション SQL 生成機能を提供する拡張プラグインです。

| 項目 | 内容 |
| :--- | :--- |
| **プラグイン ID** | `redshift-dialect` |
| **パッケージ名** | `redshift-dialect-1.0.0-beta.zip` |
| **バージョン** | `1.0.0-beta` |
| **提供機能 (`capabilities`)** | `dialect`, `metadata`, `importer`, `exporter`, `migration` |
| **必須ライブラリ (`requires`)** | `["ejs"]` |
| **実機検証状況** | 未検証（Beta 版） |

---

## 2. このプラグインが提供する機能

### 2.1. Amazon Redshift 方言 (`redshift`) とバリデーションルール
- **識別子の最大長**: **127 文字**
- **自動大文字変換**: 無効（入力ケースを保持）
- **データ型サジェスト**: `SMALLINT`, `INTEGER`, `BIGINT`, `DECIMAL`, `REAL`, `DOUBLE PRECISION`, `BOOLEAN`, `CHAR`, `VARCHAR`, `DATE`, `TIMESTAMP`, `TIMESTAMPTZ`, `SUPER`
- **新規カラム追加時のデフォルト型**: `VARCHAR(256)`（主キー時は `BIGINT`）
- **Redshift 予約語チェック**: 予約語と衝突する識別子の警告表示

### 2.2. 物理メタデータ属性 (`scope: 'dialect'`, `targetDialect: 'redshift'`)

#### テーブルレベル属性 (`tableAttributes`)
| 属性キー (`key`) | 型 | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| `schema` | `string` | `''` | スキーマ名（例: `public`） |
| `diststyle` | `select` | `''` | 分散スタイル（`AUTO` / `EVEN` / `KEY` / `ALL`） |
| `distkey` | `string` | `''` | 分散キー列名（`DISTKEY ("col")`） |
| `sortkey` | `string` | `''` | ソートキー列名（`SORTKEY (...)`） |

### 2.3. Redshift DDL インポーター (`importer`)
- `DISTSTYLE`、`DISTKEY`、`SORTKEY`、`ENCODE`、`BACKUP YES/NO` 句を前処理でクレンジングし、`postgres` 形式で DBML へ変換します。

### 2.4. Redshift DDL エクスポーター (`exporter`)
- ダブルクォート（`"..."`）引用、`IDENTITY(1,1)`、`DEFAULT` 句、`DISTSTYLE` / `DISTKEY` / `SORTKEY`、`COMMENT ON TABLE / COLUMN` を含む Redshift DDL を生成します。

### 2.5. Redshift マイグレーション SQL 生成エンジン (`migrationGenerator`)
`RECREATE_TABLE` 時に以下の構成で安全なマイグレーション SQL を生成します。
- `01_backup_table_<tbl>.sql`: 旧テーブルの退避リネーム（`ALTER TABLE ... RENAME TO`）
- `02_recreate_table_<tbl>.sql`: 新定義テーブル再作成（`IDENTITY(1,1)`, `DEFAULT`, `DISTSTYLE` / `DISTKEY` / `SORTKEY` 対応）
- `03_data_copy_<tbl>.sql`: データ移行（`BEGIN ... COMMIT`、追加カラムは `INSERT` に含め、`SELECT` 側へデフォルト値または `<<値をセット>>` を出力）
- `04_comments_<tbl>.sql`: `COMMENT ON TABLE / COLUMN` の再付与（コメント対象がある場合）
- `05_drop_backup_<tbl>.sql`: 退避テーブルの削除（`DROP TABLE IF EXISTS ... CASCADE`）

---

## 3. パッケージ構成
```text
redshift-dialect/
├── README.md                 # 本ドキュメント（プラグイン説明書）
├── plugin.json               # プラグインマニフェスト
├── index.js                  # エントリポイント
├── config.js                 # Redshift ルール・物理属性定義
├── importer.js               # Redshift DDL インポーター
├── exporter.js               # Redshift DDL エクスポーター (ejs 使用)
├── ddl-template.js           # EJS 出力テンプレート
├── migration-generator.js    # Redshift マイグレーション SQL 生成器
└── locales/
    ├── en.json               # 英語翻訳リソース
    └── ja.json               # 日本語翻訳リソース
```

---

## 4. 動作要件・インストール方法
1. **必須ライブラリ**: 本体側（`context.libs`）に `ejs` が登録されている必要があります。
2. **ビルド・インストール**: `npm --prefix dbml-editor-plugin run build:redshift` で生成した ZIP を `dbml-editor-v2/plugins/` に配置します（または `npm --prefix dbml-editor-plugin run deploy` を実行）。
3. **アンインストール**: `dbml-editor-v2/plugins/redshift-dialect-1.0.0-beta.zip` を削除します。
