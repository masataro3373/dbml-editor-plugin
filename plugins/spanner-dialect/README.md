# Google Cloud Spanner 方言プラグイン (`spanner-dialect`)

## 1. プラグイン概要
`spanner-dialect` は、`dbml-editor-v2` に対して **Google Cloud Spanner (GoogleSQL)** の方言（Dialect）、インターリーブ（親子テーブル配置）・TTL 等の物理メタデータ属性、Cloud Spanner DDL のインポート・エクスポート、および Spanner 向けマイグレーション SQL 生成機能を提供する拡張プラグインです。

| 項目 | 内容 |
| :--- | :--- |
| **プラグイン ID** | `spanner-dialect` |
| **パッケージ名** | `spanner-dialect-1.0.0.zip` |
| **バージョン** | `1.0.0` |
| **提供機能 (`capabilities`)** | `dialect`, `metadata`, `importer`, `exporter`, `migration` |
| **必須ライブラリ (`requires`)** | `["ejs"]` |
| **検証環境** | `gcr.io/cloud-spanner-emulator/emulator`（Google Cloud Spanner Emulator / 2026-11-15 エクスポート DDL・マイグレーション DDL 実機実行 PASS） |

---

## 2. このプラグインが提供する機能

### 2.1. Cloud Spanner 方言 (`spanner`) とバリデーションルール
- **識別子の最大長**: **128 文字**
- **自動大文字変換**: 無効（入力ケースを保持）
- **データ型サジェスト**: `BOOL`, `INT64`, `FLOAT64`, `NUMERIC`, `STRING(n)`, `STRING(MAX)`, `BYTES(n)`, `BYTES(MAX)`, `DATE`, `TIMESTAMP`, `JSON`
- **新規カラム追加時のデフォルト型**: `STRING(255)`（主キー時は `STRING(36)`）
- **Cloud Spanner 予約語チェック**: 予約語と衝突する識別子の警告表示

### 2.2. 物理メタデータ属性 (`scope: 'dialect'`, `targetDialect: 'spanner'`)

#### テーブルレベル属性 (`tableAttributes`)
| 属性キー (`key`) | 型 | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| `interleave_in_parent` | `string` | `''` | 親テーブル名（`INTERLEAVE IN PARENT`） |
| `on_delete_action` | `select` | `''` | 親行削除時の動作（`CASCADE` / `NO ACTION`） |
| `row_deletion_policy` | `string` | `''` | TTL 行削除ポリシー（例: `OLDER_THAN(created_at, INTERVAL 30 DAY)`） |

### 2.3. Cloud Spanner DDL インポーター (`importer`)
- Spanner 固有の括弧外 `PRIMARY KEY (...)`、`INTERLEAVE IN PARENT`、`ROW DELETION POLICY`、`NULL_FILTERED INDEX` 等を前処理で標準 SQL 互換に変換し、DBML へ変換します。

### 2.4. Cloud Spanner DDL エクスポーター (`exporter`)
- バッククォート（`` `...` ``）引用、`DEFAULT (...)` 括弧付きデフォルト値、括弧外 `PRIMARY KEY (...)`、`INTERLEAVE IN PARENT ... ON DELETE ...`、`ROW DELETION POLICY (...)`、インデックス、外部キー制約を含む Cloud Spanner DDL を生成します。

### 2.5. Cloud Spanner マイグレーション SQL 生成エンジン (`migrationGenerator`)
`RECREATE_TABLE` 時に以下の 3 ステップ構成で安全なマイグレーション SQL を生成します。
- `01_create_staging_table_<tbl>.sql`: 新定義のステージングテーブルを作成（`DEFAULT (...)`, 括弧外 `PRIMARY KEY`, `INTERLEAVE` 対応）
- `02_data_copy_<tbl>.sql`: 現行テーブルからステージングテーブルへデータ移行（追加カラムは `INSERT` に含め、`SELECT` 側へデフォルト値または `<<値をセット>>` を出力）
- `03_switch_table_<tbl>.sql`: 旧テーブル削除およびステージングテーブルのリネーム切り替え

---

## 3. パッケージ構成
```text
spanner-dialect/
├── README.md                 # 本ドキュメント（プラグイン説明書）
├── plugin.json               # プラグインマニフェスト
├── index.js                  # エントリポイント
├── config.js                 # Cloud Spanner ルール・物理属性定義
├── importer.js               # Cloud Spanner DDL インポーター
├── exporter.js               # Cloud Spanner DDL エクスポーター (ejs 使用)
├── ddl-template.js           # EJS 出力テンプレート
├── migration-generator.js    # Cloud Spanner マイグレーション SQL 生成器
└── locales/
    ├── en.json               # 英語翻訳リソース
    └── ja.json               # 日本語翻訳リソース
```

---

## 4. 動作要件・インストール方法
1. **必須ライブラリ**: 本体側（`context.libs`）に `ejs` が登録されている必要があります。
2. **ビルド・インストール**: `npm --prefix dbml-editor-plugin run build:spanner` で生成した ZIP を `dbml-editor-v2/plugins/` に配置します（または `npm --prefix dbml-editor-plugin run deploy` を実行）。
3. **アンインストール**: `dbml-editor-v2/plugins/spanner-dialect-1.0.0.zip` を削除します。
