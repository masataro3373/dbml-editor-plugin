# ER/Studio Excel 設計書プラグイン (`erstudio-excel`)

## 1. プラグイン概要
`erstudio-excel` は、`dbml-editor-v2` に対して **テーブル・カラムの「論理名 (`logicalName`)」機能**、**ER/Studio 準拠の設計メタデータ属性（全11項目）**、および **ER/Studio 形式の 25列 Excel 設計書インポーター（スマートマージ機能付き）** を提供する拡張プラグインです。

| 項目 | 内容 |
| :--- | :--- |
| **プラグイン ID** | `erstudio-excel` |
| **パッケージ名** | `erstudio-excel.zip` |
| **バージョン** | `1.0.0` |
| **提供機能 (`capabilities`)** | `importer`, `metadata` |
| **必須ライブラリ (`requires`)** | `["xlsx"]` |

---

## 2. このプラグインが提供する機能

### 2.1. テーブル・カラム「論理名 (`logicalName`)」の有効化 (`enableLogicalName: true`)
DBML 標準仕様には「論理名」が存在しないため、本プラグイン未導入時の `dbml-editor-v2` は物理名（`name`）と標準コメント（`Note`）のみで動作します。  
本プラグインを導入すると、`enableLogicalName: true` フラグによって以下の機能が有効化されます。
- **テーブル一覧画面**: 「論理テーブル名」列の表示と検索フィルタ対象への追加
- **テーブル詳細画面**: ヘッダーへの論理テーブル名表示、およびカラム一覧への「論理カラム名」列の表示
- **テーブル編集画面**: 論理テーブル名入力欄、およびカラム編集グリッドの「論理名」入力列の表示
- **DBML 出力**: `Table` ヘッダおよびカラム行へのインライン属性 `[logicalName: '...']` としての出力と読み込み（旧 `Metadata` ブロック形式の読み込み互換維持）

### 2.2. ER/Studio 設計メタデータ属性 (`scope: 'global'`)
スキーマの DBMS 方言に関わらず（`scope: 'global'`）、テーブルおよびカラムに ER/Studio 設計書準拠のメタデータ入力欄を追加します。

#### (1) テーブル（`Metadata Table`）レベル属性 (`tableAttributes` - 3項目)
テーブル編集画面の「拡張属性（設計情報）」タブに表示され、DBML の `Metadata Table` ブロックに保存されます。

| 属性キー (`key`) | 型 | 対応する Excel 列 | 説明 |
| :--- | :--- | :--- | :--- |
| `definition` | `textarea` | C列: エンティティ定義 | エンティティ（テーブル）の業務上の定義・目的 |
| `entityNote` | `textarea` | D列: エンティティノート | エンティティに関する設計上の補足ノート |
| `remarks` | `textarea` | E列: 備考 | テーブル単位の自由記述備考 |

#### (2) カラム（`Metadata Column`）レベル属性 (`columnAttributes` - 8項目)
カラム編集グリッド右端の「⚙️（設計メタデータ編集）」モーダルに表示され、DBML の `Metadata Column` ブロックに保存されます。

| 属性キー (`key`) | 型 | 対応する Excel 列 | 説明 |
| :--- | :--- | :--- | :--- |
| `definition` | `textarea` | I列: 属性定義 | カラム（属性）の業務上の定義 |
| `columnNote` | `textarea` | J列: カラムノート | カラムに関する設計上の補足ノート |
| `domainName` | `string` | K列: ドメイン名 | ER/Studio 上の共通ドメイン名 |
| `defaultName` | `string` | U列: デフォルト名 | デフォルト値制約の定義名 |
| `lookupName` | `string` | W列: ルックアップ名 | コード値・参照ルックアップ名 |
| `ruleName` | `string` | X列: ルール名 | 入力検証ルールの定義名 |
| `checkRule` | `string` | Y列: チェックルール | CHECK 制約式・値範囲ルール |
| `remarks` | `textarea` | Z列: 備考 | カラム単位の自由記述備考 |

### 2.3. Excel 設計書 (25列フォーマット) インポーター & スマートマージ (`importer`)
「📥 インポート」モーダルに **「📊 設計書 (Excel)」** タブを動的に追加します。
- **対応ファイル形式**: `.xlsx`, `.xls`, `.xlsm`（SheetJS / `xlsx` ライブラリを使用してブラウザ内で解析）
- **シート選択 & プレビュー**: ブック内の複数シートからインポート対象シートを選択し、検出されたテーブル数・カラム数をプレビュー表示します。
- **25列マッピング解析**:
  - エンティティ論理名・物理名・定義・ノート・備考
  - 属性論理名・物理名・定義・ノート・ドメイン名・データ型・長さ・精度・スケール・PK・FK・必須(NOT NULL)・デフォルト値・チェックルール・備考
- **スマートマージ（既存物理設定の保護）**:
  - 既存の DBML スキーマに対して Excel 設計書を再インポートして更新する際、Excel 側には含まれない DBMS 固有の物理設定（Oracle プラグインで設定した `tablespace` や `pctfree`、既存の `Indexes`、`Refs`、ER図上のレイアウト座標等）を破壊せず保持したまま、論理名・設計メタデータ・カラム定義をマージ更新します。

---

## 3. パッケージ構成
```text
erstudio-excel/
├── README.md                 # 本ドキュメント（プラグイン説明書）
├── plugin.json               # プラグインマニフェスト
├── index.js                  # エントリポイント
├── config.js                 # 論理名有効化フラグ & 11項目の設計メタデータ定義
├── excel-importer.js         # 25列 Excel 解析 & スマートマージインポーター (xlsx 使用)
└── locales/
    ├── en.json               # 英語翻訳リソース (必須)
    └── ja.json               # 日本語翻訳リソース
```

---

## 4. 動作要件・インストール方法
1. **必須ライブラリ**: 本体側（`context.libs`）に `xlsx` (SheetJS) が登録されている必要があります。
2. **インストール**: パッケージ化した `erstudio-excel.zip` をサーバーの `dbml-editor-v2/plugins/` ディレクトリに配置します。
3. **アンインストール**: `dbml-editor-v2/plugins/erstudio-excel.zip` を削除します。削除後、本体 UI から「論理名」列・入力欄および「設計書 (Excel)」インポートタブが非表示となり、スキーマを保存すると `logicalName` および ER/Studio 設計メタデータ属性は自動的に DBML からクリーン消去されます。

