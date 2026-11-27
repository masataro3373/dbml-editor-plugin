# SQL Server / MS-SQL 方言プラグイン (`mssql-dialect`)

## 1. プラグイン概要
`mssql-dialect` は、`dbml-editor-v2` に対して **Microsoft SQL Server (T-SQL)** の方言（Dialect）、スキーマ・ファイルグループ等の物理メタデータ属性、T-SQL DDL のインポート・エクスポート、および SQL Server 向けマイグレーション SQL 生成機能を提供する拡張プラグインです。

| 項目 | 内容 |
| :--- | :--- |
| **プラグイン ID** | `mssql-dialect` |
| **パッケージ名** | `mssql-dialect-1.0.0.zip` |
| **バージョン** | `1.0.0` |
| **提供機能 (`capabilities`)** | `dialect`, `metadata`, `importer`, `exporter`, `migration` |
| **必須ライブラリ (`requires`)** | `["ejs"]` |
| **実機検証環境** | `mcr.microsoft.com/mssql/server:2022-latest`（SQL Server 2022 Express / 2026-11-15 エクスポート DDL・マイグレーション 6 分割 SQL 実機実行 PASS） |

---

## 2. このプラグインが提供する機能

### 2.1. SQL Server 方言 (`mssql`) とバリデーションルール
- **識別子の最大長**: **128 文字**
- **自動大文字変換**: 無効（入力ケースを保持）
- **データ型サジェスト**: `INT`, `BIGINT`, `SMALLINT`, `TINYINT`, `BIT`, `NVARCHAR`, `VARCHAR`, `NCHAR`, `CHAR`, `NVARCHAR(MAX)`, `DECIMAL`, `NUMERIC`, `FLOAT`, `DATE`, `DATETIME2`, `DATETIMEOFFSET`, `VARBINARY(MAX)`, `UNIQUEIDENTIFIER`
- **新規カラム追加時のデフォルト型**: `NVARCHAR(255)`（主キー時は `INT`）
- **T-SQL 予約語チェック**: 予約語と衝突する識別子の警告表示

### 2.2. 物理メタデータ属性 (`scope: 'dialect'`, `targetDialect: 'mssql'`)

#### テーブルレベル属性 (`tableAttributes`)
| 属性キー (`key`) | 型 | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| `schema` | `string` | `'dbo'` | スキーマ名（例: `dbo`） |
| `filegroup` | `string` | `''` | テーブル格納先ファイルグループ（例: `PRIMARY` → `ON [PRIMARY]`） |

### 2.3. T-SQL DDL インポーター (`importer`)
- `GO` バッチ区切り、`SET ANSI_NULLS` / `QUOTED_IDENTIFIER`、`USE`、`ON [PRIMARY]`、`TEXTIMAGE_ON`、`WITH (PAD_INDEX ...)` 等を前処理で除去し、`mssql` 形式で DBML へ変換します。

### 2.4. T-SQL DDL エクスポーター (`exporter`)
- 角括弧（`[...]`）引用、`IDENTITY(1,1)`、`DEFAULT` 句（Unicode文字列の `N'...'` 対応）、`PRIMARY KEY CLUSTERED`、`NONCLUSTERED INDEX`、`EXEC sys.sp_addextendedproperty`（拡張プロパティコメント）、`GO` 区切りを含む T-SQL DDL を生成します。

### 2.5. SQL Server マイグレーション SQL 生成エンジン (`migrationGenerator`)
`RECREATE_TABLE` 時に以下の 6 ステップ構成で安全なマイグレーション SQL を生成します。
- `01_drop_constraints_and_indexes_<tbl>.sql`: 既存 FK・非PKインデックス・PK 制約の削除
- `02_backup_table_<tbl>.sql`: 旧テーブルの退避リネーム（`EXEC sp_rename`）
- `03_recreate_table_<tbl>.sql`: 新定義テーブル再作成（`IDENTITY(1,1)`, `DEFAULT`, `ON [filegroup]` 対応）
- `04_data_copy_<tbl>.sql`: データ移行（`BEGIN TRANSACTION ... COMMIT TRANSACTION`、必要時の `SET IDENTITY_INSERT ... ON/OFF`、追加カラムは `INSERT` に含め `SELECT` 側へデフォルト値または `<<値をセット>>` を出力）
- `05_indexes_fk_comments_<tbl>.sql`: インデックス・外部キー・`sp_addextendedproperty` コメントの再作成
- `06_drop_backup_<tbl>.sql`: 退避テーブルの削除（`DROP TABLE IF EXISTS`）

---

## 3. パッケージ構成
```text
mssql-dialect/
├── README.md                 # 本ドキュメント（プラグイン説明書）
├── plugin.json               # プラグインマニフェスト
├── index.js                  # エントリポイント
├── config.js                 # SQL Server ルール・物理属性定義
├── importer.js               # T-SQL DDL インポーター
├── exporter.js               # T-SQL DDL エクスポーター (ejs 使用)
├── ddl-template.js           # EJS 出力テンプレート
├── migration-generator.js    # SQL Server マイグレーション SQL 生成器
└── locales/
    ├── en.json               # 英語翻訳リソース
    └── ja.json               # 日本語翻訳リソース
```

---

## 4. 動作要件・インストール方法
1. **必須ライブラリ**: 本体側（`context.libs`）に `ejs` が登録されている必要があります。
2. **ビルド・インストール**: `npm --prefix dbml-editor-plugin run build:mssql` で生成した ZIP を `dbml-editor-v2/plugins/` に配置します（または `npm --prefix dbml-editor-plugin run deploy` を実行）。
3. **アンインストール**: `dbml-editor-v2/plugins/mssql-dialect-1.0.0.zip` を削除します。
