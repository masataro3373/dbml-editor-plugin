# MySQL / MariaDB 方言プラグイン (`mysql-dialect`)

## 1. プラグイン概要
`mysql-dialect` は、`dbml-editor-v2` に対して **MySQL / MariaDB** の方言（Dialect）、ストレージエンジン・文字セット等の物理メタデータ属性、MySQL DDL のインポート・エクスポート、および MySQL 向けマイグレーション SQL 生成機能を提供する拡張プラグインです。

| 項目 | 内容 |
| :--- | :--- |
| **プラグイン ID** | `mysql-dialect` |
| **パッケージ名** | `mysql-dialect-1.0.0.zip` |
| **バージョン** | `1.0.0` |
| **提供機能 (`capabilities`)** | `dialect`, `metadata`, `importer`, `exporter`, `migration` |
| **必須ライブラリ (`requires`)** | `["ejs"]` |
| **実機検証環境** | `mysql:8.0`（MySQL 8.0 / 2026-11-15 エクスポート DDL・マイグレーション 6 分割 SQL 実機実行 PASS） |

---

## 2. このプラグインが提供する機能

### 2.1. MySQL / MariaDB 方言 (`mysql`) とバリデーションルール
- **識別子の最大長**: **64 文字**
- **自動大文字変換**: 無効（入力ケースを保持）
- **データ型サジェスト**: `INT`, `BIGINT`, `SMALLINT`, `TINYINT`, `VARCHAR`, `CHAR`, `TEXT`, `MEDIUMTEXT`, `LONGTEXT`, `DECIMAL`, `DOUBLE`, `FLOAT`, `DATE`, `DATETIME`, `TIMESTAMP`, `BLOB`, `JSON`
- **新規カラム追加時のデフォルト型**: `VARCHAR(255)`（主キー時は `BIGINT`）
- **MySQL 予約語チェック**: 予約語と衝突する識別子の警告表示

### 2.2. 物理メタデータ属性 (`scope: 'dialect'`, `targetDialect: 'mysql'`)

#### テーブルレベル属性 (`tableAttributes`)
| 属性キー (`key`) | 型 | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| `engine` | `select` | `'InnoDB'` | ストレージエンジン（`InnoDB` / `MyISAM` / `MEMORY`） |
| `charset` | `string` | `'utf8mb4'` | デフォルト文字セット（`DEFAULT CHARSET`） |
| `collate` | `string` | `''` | 照合順序（`COLLATE`） |

### 2.3. MySQL DDL インポーター (`importer`)
- `mysqldump` の条件付きコメント（`/*!...*/`）、`LOCK/UNLOCK TABLES`、`SET`、`USE` 文を前処理で除去し、`mysql` 形式で DBML へ変換します。

### 2.4. MySQL DDL エクスポーター (`exporter`)
- バッククォート（`` `...` ``）引用、`AUTO_INCREMENT`、`DEFAULT` 句、インライン `COMMENT '...'`、`ENGINE=... DEFAULT CHARSET=...`、PK / FK / インデックスを含む MySQL DDL を生成します。

### 2.5. MySQL マイグレーション SQL 生成エンジン (`migrationGenerator`)
`RECREATE_TABLE` 時に以下の 6 ステップ構成で安全なマイグレーション SQL を生成します。
- `01_drop_constraints_and_indexes_<tbl>.sql`: 既存 FK (`DROP FOREIGN KEY`)・非PKインデックス (`DROP INDEX ... ON ...`)・PK (`DROP PRIMARY KEY`) の削除
- `02_backup_table_<tbl>.sql`: 旧テーブルの退避リネーム（`RENAME TABLE ... TO ...`）
- `03_recreate_table_<tbl>.sql`: 新定義テーブル再作成（`AUTO_INCREMENT`, `DEFAULT`, インライン `COMMENT`, `ENGINE`/`CHARSET` 対応）
- `04_data_copy_<tbl>.sql`: データ移行（`START TRANSACTION ... COMMIT`、追加カラムは `INSERT` に含め、`SELECT` 側へデフォルト値または `<<値をセット>>` を出力）
- `05_indexes_and_fk_<tbl>.sql`: インデックスおよび外部キー制約の再作成
- `06_drop_backup_<tbl>.sql`: 退避テーブルの削除（`DROP TABLE IF EXISTS`）

---

## 3. パッケージ構成
```text
mysql-dialect/
├── README.md                 # 本ドキュメント（プラグイン説明書）
├── plugin.json               # プラグインマニフェスト
├── index.js                  # エントリポイント
├── config.js                 # MySQL ルール・物理属性定義
├── importer.js               # MySQL DDL インポーター
├── exporter.js               # MySQL DDL エクスポーター (ejs 使用)
├── ddl-template.js           # EJS 出力テンプレート
├── migration-generator.js    # MySQL マイグレーション SQL 生成器
└── locales/
    ├── en.json               # 英語翻訳リソース
    └── ja.json               # 日本語翻訳リソース
```

---

## 4. 動作要件・インストール方法
1. **必須ライブラリ**: 本体側（`context.libs`）に `ejs` が登録されている必要があります。
2. **ビルド・インストール**: `npm --prefix dbml-editor-plugin run build:mysql` で生成した ZIP を `dbml-editor-v2/plugins/` に配置します（または `npm --prefix dbml-editor-plugin run deploy` を実行）。
3. **アンインストール**: `dbml-editor-v2/plugins/mysql-dialect-1.0.0.zip` を削除します。
