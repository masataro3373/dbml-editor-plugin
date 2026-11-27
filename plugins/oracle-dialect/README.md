# Oracle Database 方言プラグイン (`oracle-dialect`)

## 1. プラグイン概要
`oracle-dialect` は、`dbml-editor-v2` に対して **Oracle Database (12c+ / 11g)** の方言（Dialect）、物理ストレージ属性（表領域・PCTFREE 等）、Oracle SQL (DDL) のインポート・エクスポート、および Oracle 向けマイグレーション SQL 生成機能を提供する拡張プラグインです。

| 項目 | 内容 |
| :--- | :--- |
| **プラグイン ID** | `oracle-dialect` |
| **パッケージ名** | `oracle-dialect.zip` |
| **バージョン** | `1.0.0` |
| **提供機能 (`capabilities`)** | `dialect`, `metadata`, `importer`, `exporter`, `migration` |
| **必須ライブラリ (`requires`)** | `["ejs"]` |
| **実機検証環境** | `gvenzl/oracle-free:23-slim-faststart`（Oracle Database 23ai Free / 2026-11-15 エクスポート DDL・マイグレーション 6 分割 SQL 実機実行 PASS） |

---

## 2. このプラグインが提供する機能

### 2.1. Oracle 方言 (`oracle_12c` / `oracle_11g`) とバリデーションルール
スキーマ設定の「DBMS / 方言」選択肢に以下の 2 つを追加します。
- **`Oracle (12c+)` (`oracle_12c`)**:
  - 識別子（テーブル名・カラム名・インデックス名）の最大長: **128 文字**
- **`Oracle 11g` (`oracle_11g`)**:
  - 識別子（テーブル名・カラム名・インデックス名）の最大長: **30 文字**
- **共通ルール**:
  - 物理名の自動大文字変換（`uppercaseIdentifiers: true`）
  - Oracle 固有データ型のサジェスト（`VARCHAR2`, `NVARCHAR2`, `NUMBER`, `DATE`, `TIMESTAMP`, `CLOB`, `BLOB`, `CHAR`, `RAW` 等）
  - 新規カラム追加時のデフォルト型: `VARCHAR2(100)`（主キー時は `NUMBER(10)`）
  - Oracle 予約語チェック（`SELECT`, `TABLE`, `USER`, `DATE`, `LEVEL`, `ROWNUM`, `VARCHAR2`, `NUMBER` 等の警告表示）

### 2.2. 物理メタデータ属性 (`scope: 'dialect'`, `targetDialect: 'oracle'`)
スキーマの DBMS が `oracle_12c` または `oracle_11g` に設定されているときのみ、以下の属性入力欄と DBML 保存を有効化します。

#### (1) スキーマ（`Project`）レベル属性 (`projectAttributes`)
スキーマ設定モーダル・スキーマ詳細画面に表示され、DBML の `Project` ブロックに保存されます。

| 属性キー (`key`) | 型 | 説明 |
| :--- | :--- | :--- |
| `data_tablespaces` | `list` (カンマ区切り) | データ用表領域の候補リスト（例: `USERS, APP_DATA`）。テーブルの `tablespace` 入力欄のサジェスト候補になります。 |
| `index_tablespaces` | `list` (カンマ区切り) | インデックス用表領域の候補リスト（例: `APP_IDX`）。テーブルの `index_tablespace` 入力欄のサジェスト候補になります。 |
| `lob_tablespaces` | `list` (カンマ区切り) | LOB 用表領域の候補リスト（例: `APP_LOB`）。テーブルの `lob_tablespace` 入力欄のサジェスト候補になります。 |

#### (2) テーブル（`Metadata Table`）レベル属性 (`tableAttributes`)
テーブル編集画面の「拡張属性（物理設定）」タブに表示され、DBML の `Metadata Table` ブロックに保存されます。

| 属性キー (`key`) | 型 | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| `tablespace` | `string` | `'USERS'` | テーブル格納先の表領域名（テーブル詳細画面のヘッダーにバッジ表示されます） |
| `index_tablespace` | `string` | `''` | 主キー・インデックス格納先の表領域名 |
| `lob_tablespace` | `string` | `''` | CLOB / BLOB カラム格納先の表領域名 |
| `pctfree` | `number` | `10` | ブロック内の更新用空き領域割合 (`PCTFREE`) |
| `initrans` | `number` | `1` | 初期トランザクションスロット数 (`INITRANS`) |
| `logging` | `select` | `'YES'` | REDO ログ出力設定 (`YES` / `NO`) |

### 2.3. Oracle SQL (DDL) インポーター (`importer`)
「📥 インポート ＞ SQL (DDL)」にて `Oracle (12c+)` または `Oracle 11g` を選択可能にします。
- `CREATE TABLE`、`ALTER TABLE ... ADD CONSTRAINT`、`CREATE INDEX`、`COMMENT ON TABLE / COLUMN` を解析して DBML に変換します。
- `TABLESPACE`、`PCTFREE`、`INITRANS`、`LOGGING / NOLOGGING` 句を抽出し、`Metadata Table` に自動反映します。

### 2.4. Oracle SQL (DDL) エクスポーター (`exporter`)
「📤 エクスポート ＞ SQL (DDL)」にて `Oracle (12c+)` または `Oracle 11g` を選択可能にします。
- `ejs` テンプレートエンジンを使用して、物理属性（`TABLESPACE`, `PCTFREE`, `INITRANS`, `LOGGING`）、PK/FK/Unique 制約、インデックス、`COMMENT ON` 文を含む Oracle 用の DDL スクリプトを生成します。

### 2.5. Oracle マイグレーション SQL 生成エンジン (`migrationGenerator`)
「🛠️ ツール ＞ 🔄 マイグレーション」の Step 3（SQL 出力）において、本体が検出したスキーマ差分（`diffResult`）をもとに、Oracle 固有のマイグレーション SQL ファイル一式を出力します。
- `01_backup_tables.sql`: 変更・削除対象テーブルの退避 (`CREATE TABLE ... AS SELECT`)
- `02_drop_constraints.sql`: 関連する外部キー制約・インデックスの削除
- `03_recreate_tables.sql`: 新定義でのテーブル再作成 (`CREATE TABLE` + 物理表領域設定 + `COMMENT ON`)
- `04_migrate_data.sql`: 退避テーブルから新テーブルへの共通カラムデータ移行 (`INSERT INTO ... SELECT`)
- `05_restore_constraints.sql`: インデックスおよび外部キー制約の再作成

---

## 3. パッケージ構成
```text
oracle-dialect/
├── README.md                 # 本ドキュメント（プラグイン説明書）
├── plugin.json               # プラグインマニフェスト
├── index.js                  # エントリポイント
├── config.js                 # Oracle 12c+ / 11g ルール・物理属性定義
├── importer.js               # Oracle DDL インポーター
├── exporter.js               # Oracle DDL エクスポーター (ejs 使用)
├── migration-generator.js    # Oracle マイグレーション SQL 生成器
└── locales/
    ├── en.json               # 英語翻訳リソース (必須)
    └── ja.json               # 日本語翻訳リソース
```

---

## 4. 動作要件・インストール方法
1. **必須ライブラリ**: 本体側（`context.libs`）に `ejs` が登録されている必要があります。
2. **インストール**: パッケージ化した `oracle-dialect.zip` をサーバーの `dbml-editor-v2/plugins/` ディレクトリに配置します。
3. **アンインストール**: `dbml-editor-v2/plugins/oracle-dialect.zip` を削除します。削除後、スキーマを保存すると Oracle 固有の物理メタデータ属性は自動的に DBML からクリーン消去されます。

