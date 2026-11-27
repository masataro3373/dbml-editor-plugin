# dbml-editor-v2 プラグイン開発ガイドライン (Plugin Developer Guidelines)
Version: 1.3.1  
Last Updated: 2026-11-07  
Target Architecture: Web SPA (Vite + Vanilla JS Light DOM) + Node.js/Express Backend  

本書は `dbml-editor-v2` におけるプラグイン（拡張機能）を開発・保守するための公式仕様書および開発規約です。  
人間の開発者のみならず、**AI モデルにプロンプトとして提示してプラグインの設計・コード生成を行わせる仕様書**としてもそのまま利用できる形式で定義されています。

---

## 目次
1. [基本設計理念と本体・プラグインの責務境界](#1-基本設計理念と本体プラグインの責務境界)
2. [パッケージ構造と配信・セキュリティ規約](#2-パッケージ構造と配信セキュリティ規約)
3. [マニフェスト規約 (`plugin.json`)](#3-マニフェスト規約-pluginjson)
4. [外部ライブラリと本体 API の利用規約（ホワイトリスト方式）](#4-外部ライブラリと本体-api-の利用規約ホワイトリスト方式)
5. [多言語化 (i18n) 規約](#5-多言語化-i18n-規約)
6. [UI・スタイリング・テーマ連動規約](#6-uiスタイリングテーマ連動規約)
7. [Metadata 拡張規約（Project / Table / Column 属性とクリーン消去）](#7-metadata-拡張規約project--table--column-属性とクリーン消去)
8. [方言・インポーター・エクスポーター・マイグレーション拡張規約](#8-方言インポーターエクスポーターマイグレーション拡張規約)
9. [ライフサイクルとプラグイン API (`PluginContext`)](#9-ライフサイクルとプラグイン-api-plugincontext)
10. [UI 閲覧専用権限設計（バージョン情報への状態表示）](#10-ui-閲覧専用権限設計バージョン情報への状態表示)
11. [リファレンス最小プラグイン (雛形テンプレート)](#11-リファレンス最小プラグイン-雛形テンプレート)

---

## 1. 基本設計理念と本体・プラグインの責務境界

### 1.1. 6つの基本原則
1. **ゼロ・フットプリント（非破壊・疎結合）**:
   - プラグインは本体（コア）のソースコードを一切変更せずに、外部から機能を合体・分離できなければならない。
   - プラグインはブラウザ（クライアント側）で動作し、サーバー側の処理やAPIは拡張しない。
2. **ファイルシステム制御方式（置くだけ / 消すだけ）**:
   - プラグインのインストール・アンインストールは、サーバーの `plugins/` ディレクトリに対する ZIP 配置・削除（サーバー管理者のみ）によって行う。
   - 一般ユーザー向け Web 画面からはプラグインの追加・削除操作を一切行わせず、**「導入済みプラグイン一覧と状態の確認（閲覧専用）」**とすることで、権限事故や不正スクリプト混入を防止する。
3. **外部ライブラリのホワイトリスト統制（バンドル同梱の禁止）**:
   - プラグイン内に外部ライブラリ（npm パッケージ等）をバンドル・同梱することは禁止する。
   - 外部ライブラリが必要な場合は `plugin.json` の `"requires"` に宣言し、サーバー管理者が本体側に導入して `context.libs` 経由で提供するホワイトリスト方式とする。必須ライブラリが本体に未導入の場合、そのプラグインは動作せず安全にスキップされる。
4. **完全な多言語フォールバック（英語基準・別ファイル必須）**:
   - プラグインは独立した言語ファイル（`locales/*.json`）を持ち、**英語（`en.json`）を必須**とする。ユーザー言語の翻訳が存在しない場合は自動的に英語で表示される。設定ファイルやコードへの直接の表示文字列埋め込みは禁止する。
5. **完全なテーマ自動連動（固定色の禁止）**:
   - プラグイン UI はハードコードされた色コードを禁止し、本体が提供する CSS 変数（`client/src/styles/tokens.css`）のみを使用する。本体の Light / Dark / Sepia の全テーマに 100% 自動追従しなければならない。
6. **安全なクリーン消去原則（方式 A ＋ データ保護ガード）**:
   - プラグインがアンインストールされた場合やスキーマの方言が切り替わった場合、次回保存時（画面モデルからの DBML 再生成時）に無効な属性を DBML から自動クリーンアップし、ファイルにゴミデータを残さない。
   - ただし、プラグイン初期ロード完了前や一時的なロードエラー時には属性を消去しない安全ガードを設ける。

### 1.2. 本体（コア）とプラグインの明確な境界線
プラグインが 0 個の初期状態では、本体は **100% 純粋な DBML 標準ツール**として動作します。

| 領域 | 本体（コア）が持つ標準機能 | プラグインに切り出す機能 |
| :--- | :--- | :--- |
| **データモデル & UI** | ・DBML 標準仕様（物理名 `name`、型、`pk`/`not null`/`unique`/`default`、`Note`、`Indexes`、`Refs`、`TableGroup`）<br/>※ 論理名（`logicalName`）や物理表領域は本体には持たない | **・Oracle プラグイン**: 表領域（Project/Table）、PCTFREE、INITRANS、Oracle固有データ型、30/128文字制限、大文字変換<br/>**・ER/Studio プラグイン**: **論理名 (`logicalName`) 列・入力欄の有効化**、エンティティ定義 (`definition`)、ドメイン名 (`domainName`) 等の設計書メタデータ |
| **インポート / エクスポート** | ・スキーマ (`.dbml`)<br/>・ER図 (`.json`)<br/>・プロジェクト一括 (`.zip` / `.json`)<br/>・HTML仕様書出力 | **・Oracle プラグイン**: Oracle SQL (DDL) インポート & エクスポート<br/>**・ER/Studio プラグイン**: Excel 設計書 (`.xlsx` 等) 25列インポート & スマートマージ |
| **ツールメニュー** | ・**プレイグラウンド**（DBML可視化・本体内蔵）<br/>・**SQLビジュアライザ**（`node-sql-parser` によるクエリ可視化・本体内蔵）<br/>・**マイグレーションの差分比較ベース UI & AST 比較エンジン (`schema-diff.js`)** | **・方言プラグイン（Oracle等）**: マイグレーション Step 3 における **DBMS 固有のマイグレーション SQL 生成エンジン (`migrationGenerator`)** |

---

## 2. パッケージ構造と配信・セキュリティ規約

### 2.1. ディレクトリ構造
プラグインは以下のディレクトリ構造を厳守して ZIP アーカイブ化します。**すべてのプラグインには、そのプラグインの目的・提供機能・拡張メタデータ・必須ライブラリを明記した `README.md` を必ず添付します。**

```text
<plugin-id>.zip (例: oracle-dialect.zip)
├── README.md               # 【必須】プラグイン説明書 (目的・機能・メタデータ・必須ライブラリ仕様)
├── plugin.json             # 【必須】プラグインマニフェスト (メタ情報・機能宣言・必須ライブラリ宣言)
├── index.js                # 【必須】プラグインエントリポイント (ESモジュール)
├── config.js               # 【任意】プラグイン内の分割モジュール (相対パス './config.js' で import 可)
├── locales/                # 【必須】多言語リソースディレクトリ
│   ├── en.json             # 【必須】英語リソース (未配置時はロード拒否)
│   ├── ja.json             # 【推奨】日本語リソース (未配置時は en.json にフォールバック)
│   └── <lang>.json         # 【任意】他言語リソース (例: zh.json, de.json)
└── assets/                 # 【任意】プラグイン固有のアセット・CSS
    └── style.css           # 【任意】プラグイン専用スタイルシート (CSS変数必須)
```

### 2.2. サーバー配信とセキュリティ要件
- **信頼境界**: プラグインはブラウザ上で本体と同じオリジン・権限で動作するため、サーバー管理者が信頼・監査したプラグインのみを `plugins/` に配置する。
- **Zip-Slip（パストラバーサル）防止**: サーバーが ZIP 内のエントリを読み取る際、パスに `..` を含むエントリや絶対パスは即座に拒否する。
- **キャッシュバスティング**: プラグインの ZIP を更新した際にブラウザの古いキャッシュが使われないよう、本体がプラグインの JS/CSS を読み込む URL には `?v=<version>`（`plugin.json` の `version`）を自動付与する。

---

## 3. マニフェスト規約 (`plugin.json`)

`plugin.json` はプラグインの基本情報、提供機能、および必須ライブラリを宣言する定義ファイルです。

```json
{
  "id": "erstudio-excel",
  "nameKey": "plugin.name",
  "descriptionKey": "plugin.description",
  "version": "1.0.0",
  "author": "Development Team",
  "minAppVersion": "2.0.0",
  "entry": "index.js",
  "styles": ["assets/style.css"],
  "capabilities": [
    "importer",
    "metadata"
  ],
  "requires": [
    "xlsx"
  ]
}
```

### マニフェスト各項目の仕様
| プロパティ | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `id` | `string` | **必須** | プラグインの一意識別子。英小文字、数字、ハイフンのみ (`^[a-z0-9-]+$`)。重複IDがある場合は後発をエラーとしてスキップする。 |
| `nameKey` | `string` | **必須** | プラグイン名の翻訳キー（直接テキスト埋め込みは禁止） |
| `descriptionKey` | `string` | **必須** | プラグイン説明文の翻訳キー |
| `version` | `string` | **必須** | セマンティックバージョニング (`X.Y.Z`) |
| `author` | `string` | 任意 | 作成者・チーム名 |
| `minAppVersion` | `string` | 任意 | 動作に必要な本体の最小バージョン（例: `"2.0.0"`）。満たさない場合はロードをスキップする。 |
| `entry` | `string` | **必須** | プラグインのメインスクリプト（通常 `"index.js"`） |
| `styles` | `string[]` | 任意 | 同梱する CSS ファイルの相対パス配列 |
| `capabilities` | `string[]` | **必須** | 提供する拡張機能の種類 (`dialect`, `importer`, `exporter`, `metadata`, `migration`, `menu`) |
| `requires` | `string[]` | 任意 | 本体側（`context.libs`）に導入されている必要がある外部ライブラリ名の配列（例: `["xlsx"]`, `["ejs"]`） |

---

## 4. 外部ライブラリと本体 API の利用規約（ホワイトリスト方式）

### 4.1. 禁止事項
1. **外部ライブラリのバンドル同梱の禁止**: プラグイン内に npm パッケージ等のサードパーティライブラリをバンドル・ミニファイして同梱してはならない。
2. **裸のパッケージ名 `import` の禁止**: `import 'xlsx'` のような記述はブラウザで解決エラーとなるため記述してはならない（プラグイン内の自作別ファイル `./config.js` 等の相対パス `import` のみ可）。
3. **外部 URL / CDN からの動的ロードの禁止**: `import('https://...')` 等で外部ネットワークからスクリプトを取得してはならない。

### 4.2. 本体基底クラスの利用 (`context.api`)
本体の基底クラスは `activate(context)` に渡される `context.api` から取得します。
- `context.api.BaseDialect`: 方言基底クラス
- `context.api.BaseImporter`: インポーター基底クラス
- `context.api.BaseExporter`: エクスポーター基底クラス

### 4.3. 外部ライブラリの利用 (`plugin.json` の `"requires"` ＋ `context.libs`)
1. `plugin.json` の `"requires"` 配列に必須ライブラリ名（例: `["xlsx"]`）を明記する。
2. プラグインのコード内では `context.libs.<ライブラリ名>`（例: `const XLSX = context.libs.xlsx;`）から取得して利用する。
3. 本体起動時、`"requires"` に記載されたライブラリが本体の `context.libs`（`client/src/core/plugin-libs.js`）に存在しない場合、プラグインマネージャーはそのプラグインの `activate()` を実行せず安全にスキップし、「ヘルプ ＞ バージョン情報」画面に **`missing_libs`（必須ライブラリ未導入）** として表示する。

> [!NOTE]
> **サーバー管理者向け手順について**: サーバー管理者が本体に npm パッケージを追加し `context.libs`（`client/src/core/plugin-libs.js`）へ登録する具体的な運用手順は、別途作成する**「サーバ管理者ガイド」**に記載します。

---

## 5. 多言語化 (i18n) 規約

- **別ファイル分離の原則**: 設定ファイルやコード内に直接表示文字列をハードコードしてはならない。すべて `locales/*.json` に定義する。
- **英語リソース (`locales/en.json`) の必須性**: `locales/en.json` が存在しないプラグインはロードを拒否する。
- **名前空間とフォールバック**:
  - 本体側は各プラグインの辞書を `plugins.<pluginId>.*` に自動隔離する。
  - プラグイン内では `context.t('attributes.tablespace')` で参照する。
  - ユーザー設定言語（例: `ja`）にキーが無い場合は自動的に **`locales/en.json`（英語）** にフォールバックする。

---

## 6. UI・スタイリング・テーマ連動規約

プラグインのスタイルは固定色（`#fff`, `#000` 等）を禁止し、必ず以下の本体実在 CSS 変数（`client/src/styles/tokens.css`）を使用すること。これにより **Light / Dark / Sepia** の全テーマに自動追従します。

| CSS 変数名 | Light テーマ | Dark テーマ | Sepia テーマ | 主な用途 |
| :--- | :--- | :--- | :--- | :--- |
| `var(--bg-primary)` | `#ffffff` | `#0f172a` | `#fbf0d9` | メイン画面、入力欄、モーダル背景 |
| `var(--bg-secondary)` | `#f8fafc` | `#1e293b` | `#f4e3c1` | パネル背景、セクション背景 |
| `var(--bg-tertiary)` | `#f1f5f9` | `#334155` | `#ebd4a7` | ホバー背景、バッジ、サブヘッダー |
| `var(--bg-card)` | `#ffffff` | `#1e293b` | `#fbf0d9` | カード・ダイアログ背景 |
| `var(--text-primary)` | `#0f172a` | `#f8fafc` | `#433422` | メイン見出し、本文テキスト、入力文字 |
| `var(--text-secondary)`| `#475569` | `#cbd5e1` | `#5f4b32` | ラベル、サブテキスト |
| `var(--text-muted)` | `#94a3b8` | `#64748b` | `#8c7353` | 補足説明、プレースホルダー、無効状態 |
| `var(--border-color)` | `#e2e8f0` | `#334155` | `#d8c29d` | 枠線、入力枠線、区切り線 |
| `var(--border-focus)` | `#3b82f6` | `#60a5fa` | `#a05a2c` | フォーカス時の強調枠線 |
| `var(--primary)` | `#2563eb` | `#3b82f6` | `#a05a2c` | 主要ボタン背景、アクティブ強調 |
| `var(--primary-hover)` | `#1d4ed8` | `#60a5fa` | `#83441b` | 主要ボタンホバー時 |
| `var(--primary-text)` | `#ffffff` | `#ffffff` | `#ffffff` | 主要ボタン上の文字色 |
| `var(--success)` | `#16a34a` | `#22c55e` | `#447a38` | 成功ステータス・バッジ |
| `var(--warning)` | `#d97706` | `#f59e0b` | `#b36b00` | 警告ステータス・バッジ |
| `var(--danger)` | `#dc2626` | `#ef4444` | `#b33939` | エラー・削除ボタン |
| `var(--overlay-bg)` | `rgba(15,23,42,0.45)` | `rgba(0,0,0,0.75)` | `rgba(67,52,34,0.5)` | モーダル背面オーバーレイ |

---

## 7. Metadata 拡張規約（Project / Table / Column 属性とクリーン消去）

プラグインは、以下の 3 階層のメタデータ属性と、`logicalName`（論理名）機能の有効化を登録できます。

### 7.1. 3階層の属性定義と論理名フラグ
1. **`enableLogicalName: true`（論理名の有効化）**:
   - DBML 標準には「論理名（`logicalName`）」が存在しないため、初期状態の本体 UI ではテーブル・カラムの「論理名」入力欄および一覧列は非表示となる。
   - ER/Studio プラグイン等が `enableLogicalName: true` を登録すると、テーブル一覧・詳細・編集画面に「論理名」列・入力欄が表示され、DBML の `Metadata Table` / `Metadata Column` に `logicalName` が出力される。
2. **`projectAttributes`（スキーマ / Project レベル属性）**:
   - スキーマ設定モーダル（`schema-modal.js`）およびスキーマ詳細画面（`schema-view.js`）、DBML の `Project` ブロックに追加される属性（例: Oracle の `data_tablespaces`, `index_tablespaces`, `lob_tablespaces`）。
3. **`tableAttributes`（Table レベル属性）**:
   - テーブル編集画面の拡張属性タブ、テーブル詳細画面のバッジ、および `Metadata Table` ブロックに追加される属性（例: Oracle の `tablespace`, `pctfree`、ER/Studio の `definition`, `entityNote`, `remarks`）。
4. **`columnAttributes`（Column レベル属性）**:
   - カラム編集グリッドの「⚙️ 設計メタデータ編集」モーダル、および `Metadata Column` ブロックに追加される属性（例: ER/Studio の `definition`, `domainName`, `checkRule` 等）。

### 7.2. スコープ分類（`dialect` vs `global`）
- **`scope: 'dialect'`（DBMS方言依存・物理属性）**:
  - `targetDialect`（例: `'oracle'` または `'oracle_12c'`）とスキーマの方言が一致するときのみ UI 表示・DBML 保存される。
- **`scope: 'global'`（DBMS方言非依存・論理設計属性）**:
  - スキーマの方言に関わらず、プラグインが有効な限り常に UI 表示・DBML 保存される。

```javascript
// Oracle プラグインの物理属性定義例
export const oracleMetadataDef = {
  projectAttributes: [
    {
      key: 'data_tablespaces',
      labelKey: 'attributes.dataTablespaces',
      hintKey: 'attributes.hintTablespaces',
      type: 'list',                      // カンマ区切りリスト
      scope: 'dialect',
      targetDialect: 'oracle'
    },
    {
      key: 'index_tablespaces',
      labelKey: 'attributes.indexTablespaces',
      hintKey: 'attributes.hintTablespaces',
      type: 'list',
      scope: 'dialect',
      targetDialect: 'oracle'
    },
    {
      key: 'lob_tablespaces',
      labelKey: 'attributes.lobTablespaces',
      hintKey: 'attributes.hintTablespaces',
      type: 'list',
      scope: 'dialect',
      targetDialect: 'oracle'
    }
  ],
  tableAttributes: [
    {
      key: 'tablespace',
      labelKey: 'attributes.tablespace',
      type: 'string',
      default: 'USERS',
      suggestFromProjectKey: 'data_tablespaces', // Project属性から入力候補をサジェスト
      showBadge: true,                           // テーブル詳細画面にバッジ表示
      scope: 'dialect',
      targetDialect: 'oracle',
      group: 'physical'
    }
  ],
  columnAttributes: []
};
```

```javascript
// ER/Studio プラグインの論理・設計属性定義例
export const erStudioMetadataDef = {
  enableLogicalName: true, // ★ テーブル・カラムの「論理名 (logicalName)」を有効化
  projectAttributes: [],
  tableAttributes: [
    { key: 'definition', labelKey: 'tableAttrs.definition', type: 'textarea', scope: 'global', group: 'design' },
    { key: 'entityNote', labelKey: 'tableAttrs.entityNote', type: 'textarea', scope: 'global', group: 'design' },
    { key: 'remarks',    labelKey: 'tableAttrs.remarks',    type: 'textarea', scope: 'global', group: 'design' }
  ],
  columnAttributes: [
    { key: 'definition',  labelKey: 'colAttrs.definition',  type: 'textarea', scope: 'global', group: 'design' },
    { key: 'columnNote',  labelKey: 'colAttrs.columnNote',  type: 'textarea', scope: 'global', group: 'design' },
    { key: 'domainName',  labelKey: 'colAttrs.domainName',  type: 'string',   scope: 'global', group: 'design' },
    { key: 'defaultName', labelKey: 'colAttrs.defaultName', type: 'string',   scope: 'global', group: 'design' },
    { key: 'lookupName',  labelKey: 'colAttrs.lookupName',  type: 'string',   scope: 'global', group: 'design' },
    { key: 'ruleName',    labelKey: 'colAttrs.ruleName',    type: 'string',   scope: 'global', group: 'design' },
    { key: 'checkRule',   labelKey: 'colAttrs.checkRule',   type: 'string',   scope: 'global', group: 'design' },
    { key: 'remarks',     labelKey: 'colAttrs.remarks',     type: 'textarea', scope: 'global', group: 'design' }
  ]
};
```

### 7.3. クリーン消去方式（方式 A）とデータ保護ガード
- **クリーン消去**: 画面モデルから DBML を再生成する `generateDbml()` 実行時、現在有効な方言の `scope: 'dialect'` 属性と、現在有効なプラグインの `scope: 'global'` 属性（および `enableLogicalName` が有効な場合の `logicalName`）のみを出力し、無効になった属性は自動的に除外する。
- **データ保護ガード**:
  1. 起動時の全プラグイン初期化が完了するまで保存操作を待機する。
  2. サーバーに存在するプラグインが `missing_libs` または `error` 状態で一時的に無効化されている場合は、既存メタデータを消去せずそのまま保持するセーフモードで保存する。

---

## 8. 方言・インポーター・エクスポーター・マイグレーション拡張規約

### 8.1. 方言 (Dialect) とマイグレーション SQL 生成器
方言プラグインは `BaseDialect` を継承したインスタンスを `context.dialects.register(dialect)` で登録します。
- `dialect.importer`: SQL (DDL) インポーター（「インポート ＞ SQL (DDL)」で選択可能になる）
- `dialect.exporter`: SQL (DDL) エクスポーター（「エクスポート ＞ SQL (DDL)」で選択可能になる）
- `dialect.migrationGenerator`: マイグレーション画面（Step 3）において、本体が抽出した AST 差分（`diffResult`）を受け取り、その DBMS 固有のマイグレーション SQL ファイル群（退避、再作成、データ移行、INDEX/FK付与等）を生成する関数。

### 8.2. 独立フォーマットのインポーター (`context.importers`)
Excel 設計書などの SQL 以外のインポーターは `context.importers.register()` で登録します。登録されたインポーターが存在するときのみ、インポートモーダルに専用タブ（例: 「設計書 (Excel)」）が動的に追加されます。

### 8.3. ヘッダーメニュー拡張 (`context.menus`)
プラグインが独自ツール画面等を提供する場合、`context.menus.registerItem({ parent, id, labelKey, icon, order, separatorBefore, onClick })` でヘッダーメニューに項目を追加できます。

---

## 9. ライフサイクルとプラグイン API (`PluginContext`)

プラグインのエントリポイント（`index.js`）は、デフォルトエクスポートで `activate(context)` メソッドを持つオブジェクトを公開します。`deactivate(context)` は本体側で登録リソースを自動追跡して一括解除できるため任意です。

```javascript
// index.js (Oracle 方言プラグインの構成例)
import { oracle12cConfig, oracle11gConfig, oracleMetadataDef } from './config.js';
import { createOracleImporter } from './importer.js';
import { createOracleExporter } from './exporter.js';
import { generateOracleMigrationScripts } from './migration-generator.js';

export default {
  async activate(context) {
    const { BaseDialect } = context.api;
    const ejs = context.libs.ejs; // plugin.json の "requires": ["ejs"] で宣言

    class OracleDialect extends BaseDialect {
      constructor(config) {
        super(config);
        this.importer = createOracleImporter(config, context);
        this.exporter = createOracleExporter(config, ejs, context);
        this.migrationGenerator = (diffResult, targetTableNames, options) =>
          generateOracleMigrationScripts(diffResult, targetTableNames, config, options);
      }
    }

    // 1. 方言の登録
    context.dialects.register(new OracleDialect(oracle12cConfig));
    context.dialects.register(new OracleDialect(oracle11gConfig));

    // 2. 物理メタデータ属性（Project表領域 + Table物理属性）の登録
    context.metadata.registerAttributes(oracleMetadataDef);
  }
};
```

---

## 10. UI 閲覧専用権限設計（バージョン情報への状態表示）

ヘッダーの「**❓ ヘルプ ＞ ℹ️ バージョン情報（About）**」ダイアログ内に、導入済みプラグイン一覧と動作ステータスを表示します。
- 🟢 **有効 (`active`)**: 正常にロード・有効化済み
- 🟡 **ライブラリ未導入 (`missing_libs`)**: `requires` で指定された必須ライブラリが本体に未登録のためスキップ中
- 🔴 **エラー (`error`)**: マニフェスト不備、`en.json` 欠落、または `activate()` 実行時エラー

---

## 11. リファレンス最小プラグイン (雛形テンプレート)

```text
my-governance-plugin/
├── README.md
├── plugin.json
├── index.js
└── locales/
    ├── en.json
    └── ja.json
```

**`plugin.json`**
```json
{
  "id": "my-governance-plugin",
  "nameKey": "plugin.name",
  "descriptionKey": "plugin.description",
  "version": "1.0.0",
  "entry": "index.js",
  "capabilities": ["metadata", "menu"],
  "requires": []
}
```

**`locales/en.json` (必須)**
```json
{
  "plugin": {
    "name": "Governance Metadata Plugin",
    "description": "Adds data owner metadata and governance check menu."
  },
  "attributes": {
    "dataOwner": "Data Owner"
  },
  "menu": {
    "action": "Run Governance Check"
  },
  "messages": {
    "checkComplete": "Governance check completed."
  }
}
```

**`locales/ja.json` (推奨)**
```json
{
  "plugin": {
    "name": "ガバナンス拡張プラグイン",
    "description": "データ責任者メタデータとガバナンスチェックメニューを追加します。"
  },
  "attributes": {
    "dataOwner": "データ責任者"
  },
  "menu": {
    "action": "ガバナンスチェック実行"
  },
  "messages": {
    "checkComplete": "ガバナンスチェックが完了しました。"
  }
}
```

**`index.js`**
```javascript
export default {
  activate(context) {
    context.metadata.registerAttributes({
      tableAttributes: [
        {
          key: 'dataOwner',
          labelKey: 'attributes.dataOwner',
          type: 'string',
          default: '',
          scope: 'global',
          group: 'design'
        }
      ]
    });

    context.menus.registerItem({
      parent: 'tools',
      id: 'governance-check-action',
      labelKey: 'menu.action',
      icon: '⚡',
      order: 100,
      separatorBefore: true,
      onClick: () => {
        alert(context.t('messages.checkComplete'));
      }
    });
  }
};
```

