# PostgreSQL 方言プラグイン (`postgres-dialect`)

## 1. プラグイン概要
`postgres-dialect` は、`dbml-editor-v2` に対して **PostgreSQL** の方言（Dialect）、表領域・スキーマ等の物理メタデータ属性、PostgreSQL SQL (DDL) のインポート・エクスポート、および PostgreSQL 向けマイグレーション SQL 生成機能を提供する拡張プラグインです。

| 項目 | 内容 |
| :--- | :--- |
| **プラグイン ID** | `postgres-dialect` |
| **パッケージ名** | `postgres-dialect-1.0.0.zip` |
| **バージョン** | `1.0.0` |
| **提供機能 (`capabilities`)** | `dialect`, `metadata`, `importer`, `exporter`, `migration` |
| **必須ライブラリ (`requires`)** | `["ejs"]` |
| **実機検証環境** | `postgres:16-alpine`（PostgreSQL 16 / 2026-11-15 エクスポート DDL・マイグレーション 6 分割 SQL 実機実行 PASS） |

---

## 2. このプラグインが提供する機能

### 2.1. PostgreSQL 方言 (`postgresql`) とバリデーションルール
- **識別子の最大長**: **63 文字**
- **自動大文字変換**: 無効（入力ケースを保持）
- **データ型サジェスト**: `SERIAL`, `BIGSERIAL`, `INTEGER`, `BIGINT`, `SMALLINT`, `VARCHAR`, `CHAR`, `TEXT`, `BOOLEAN`, `NUMERIC`, `REAL`, `DOUBLE PRECISION`, `DATE`, `TIMESTAMP`, `TIMESTAMPTZ`, `TIME`, `BYTEA`, `JSONB`, `JSON`, `UUID`
- **新規カラム追加時のデフォルト型**: `VARCHAR(255)`（主キー時は `SERIAL`）
- **PostgreSQL 予約語チェック**: 予約語と衝突する識別子の警告表示

### 2.2. 物理メタデータ属性 (`scope: 'dialect'`, `targetDialect: 'postgresql'`)

#### (1) スキーマ（`Project`）レベル属性 (`projectAttributes`)
| 属性キー (`key`) | 型 | 説明 |
| :--- | :--- | :--- |
| `data_tablespaces` | `list` (カンマ区切り) | データ用表領域の候補リスト（例: `pg_default, app_data`）。テーブルの `tablespace` 入力欄のサジェスト候補になります。 |
| `index_tablespaces` | `list` (カンマ区切り) | インデックス用表領域の候補リスト。テーブルの `index_tablespace` 入力欄のサジェスト候補になります。 |

#### (2) テーブルレベル属性 (`tableAttributes`)
| 属性キー (`key`) | 型 | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| `schema` | `string` | `''` | スキーマ名（例: `public`） |
| `tablespace` | `string` | `''` | テーブル格納先の表領域名（バッジ表示対応） |
| `index_tablespace` | `string` | `''` | インデックス格納先の表領域名 |

### 2.3. PostgreSQL DDL インポーター (`importer`)
- `psql` メタコマンド（`\...`）、`SET` 文、`TABLESPACE`、`OWNER TO`、`WITH (...)` 句を前処理でクレンジングし、`postgres` 形式で DBML へ変換します。

### 2.4. PostgreSQL DDL エクスポーター (`exporter`)
- `ejs` テンプレート（`ddl-template.js`）を使用し、`SERIAL` / `BIGSERIAL`、`DEFAULT` 句、PK / FK / インデックス（`TABLESPACE` 句対応）、`COMMENT ON TABLE / COLUMN` を含む DDL を生成します。

### 2.5. PostgreSQL マイグレーション SQL 生成エンジン (`migrationGenerator`)
`RECREATE_TABLE` 時に以下の 6 ステップ構成で安全なマイグレーション SQL を生成します。
- `01_drop_constraints_and_indexes_<tbl>.sql`: 既存 FK・非PKインデックス・PK の削除（`IF EXISTS`）
- `02_backup_table_<tbl>.sql`: 旧テーブルの退避リネーム（`ALTER TABLE ... RENAME TO`）
- `03_recreate_table_<tbl>.sql`: 新定義テーブル再作成（`DEFAULT` 句・`TABLESPACE` 対応）
- `04_data_copy_<tbl>.sql`: データ移行（`BEGIN ... COMMIT`、追加カラムは `INSERT` に含め、`SELECT` 側へデフォルト値または `<<値をセット>>` を出力）
- `05_indexes_fk_comments_<tbl>.sql`: インデックス・外部キー・`COMMENT ON` の再作成
- `06_drop_backup_<tbl>.sql`: 退避テーブルの削除（`DROP TABLE IF EXISTS ... CASCADE`）

---

## 3. パッケージ構成
```text
postgres-dialect/
├── README.md                 # 本ドキュメント（プラグイン説明書）
├── plugin.json               # プラグインマニフェスト
├── index.js                  # エントリポイント
├── config.js                 # PostgreSQL ルール・物理属性定義
├── importer.js               # PostgreSQL DDL インポーター
├── exporter.js               # PostgreSQL DDL エクスポーター (ejs 使用)
├── ddl-template.js           # EJS 出力テンプレート
├── migration-generator.js    # PostgreSQL マイグレーション SQL 生成器
└── locales/
    ├── en.json               # 英語翻訳リソース
    └── ja.json               # 日本語翻訳リソース
```

---

## 4. 動作要件・インストール方法
1. **必須ライブラリ**: 本体側（`context.libs`）に `ejs` が登録されている必要があります。
2. **ビルド・インストール**: `npm --prefix dbml-editor-plugin run build:postgres` で生成した ZIP を `dbml-editor-v2/plugins/` に配置します（または `npm --prefix dbml-editor-plugin run deploy` を実行）。
3. **アンインストール**: `dbml-editor-v2/plugins/postgres-dialect-1.0.0.zip` を削除します。
