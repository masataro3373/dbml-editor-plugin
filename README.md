# DBML Editor プラグインリポジトリ (`dbml-editor-plugin`)

`dbml-editor-v2` 向けの公式プラグインパッケージ（ビルド済み `.zip`）およびソースコード・ビルド環境を提供するリポジトリです。

- **プラグインを導入して使うだけの方**: [`dist/`](./dist) ディレクトリ内から必要な `.zip` ファイルをダウンロードし、DBML Editor 本体の `plugins/` ディレクトリに配置するだけで即座に利用できます（ビルド作業は不要です）。
- **プラグインをカスタマイズ・開発する方**: `plugins/` 配下のソースコードを編集し、`npm run build` で `dist/` に `.zip` パッケージを再生成できます。

---

## 0. クイック導入ガイド（ビルド済み ZIP を使う場合）

1. 本リポジトリの [`dist/`](./dist) フォルダから、導入したいプラグインの `.zip` ファイル（例: `logicalname-1.0.0.zip`, `oracle-dialect-1.0.0.zip` 等）をダウンロードします（すべて導入しても、必要なものだけ選んで導入しても構いません）。
2. DBML Editor 本体（`dbml-editor-v2`）の `plugins/` フォルダに `.zip` ファイルをそのまま配置します（解凍不要）。
3. ブラウザをリロード（またはサーバーを再起動）し、ヘッダーの **「❓ ヘルプ」→「ℹ️ バージョン情報 (About)」** でプラグインが `✓ 有効` になっていることを確認します。

> **注意**: `erstudio-excel` や各 RDBMS 方言プラグインで論理名（和名）機能を使用する場合は、あわせて **`logicalname-1.0.0.zip`** も `plugins/` に配置してください。

---

## 1. ディレクトリ構成

```text
dbml-editor-plugin/
├── dist/                          # ビルドされたプラグイン ZIP パッケージ (.zip) の出力先
│   ├── logicalname-1.0.0.zip
│   ├── erstudio-excel-1.0.0.zip
│   ├── postgres-dialect-1.0.0.zip
│   ├── mysql-dialect-1.0.0.zip
│   ├── mssql-dialect-1.0.0.zip
│   ├── oracle-dialect-1.0.0.zip
│   ├── spanner-dialect-1.0.0.zip
│   ├── snowflake-dialect-1.0.0-beta.zip
│   ├── bigquery-dialect-1.0.0-beta.zip
│   ├── redshift-dialect-1.0.0-beta.zip
│   └── databricks-dialect-1.0.0-beta.zip
├── plugins/                       # 各プラグインのソースコード（全11種）
│   ├── erstudio-excel/            # [検証済] ER/Studio Excel 設計書プラグイン (論理名・属性・インポーター)
│   ├── logicalname/               # [検証済] 論理名サポート専用プラグイン (ゼロ依存・軽量)
│   ├── postgres-dialect/          # [検証済] PostgreSQL 方言・物理属性・DDL入出力・マイグレーション
│   ├── mysql-dialect/             # [検証済] MySQL 方言・物理属性・DDL入出力・マイグレーション
│   ├── mssql-dialect/             # [検証済] SQL Server 方言・物理属性・DDL入出力・マイグレーション
│   ├── oracle-dialect/            # [検証済] Oracle 方言・物理属性・DDL入出力・マイグレーション
│   ├── spanner-dialect/           # [検証済] Cloud Spanner 方言・物理属性・DDL入出力・マイグレーション
│   ├── snowflake-dialect/         # [Beta] Snowflake 方言・物理属性・DDL入出力・マイグレーション
│   ├── bigquery-dialect/          # [Beta] BigQuery 方言・物理属性・DDL入出力・マイグレーション
│   ├── redshift-dialect/          # [Beta] Redshift 方言・物理属性・DDL入出力・マイグレーション
│   └── databricks-dialect/        # [Beta] Databricks SQL 方言・物理属性・DDL入出力・マイグレーション
├── scripts/
│   ├── build.mjs                  # プラグイン共通パッケージングスクリプト (STORE形式・CRC32・バージョン自動付与・自己検証)
│   └── deploy.mjs                 # [任意実行] dist 内の zip を本体 (v2/plugins) へ反映するヘルパー
└── package.json                   # npm scripts 定義
```

---

## 2. プラグインのビルド方法

### 2.1. 全プラグインの一括ビルド
すべてのプラグインをパッケージングし、`dist/<plugin-id>-<version>.zip` を生成します。

```powershell
# npm スクリプト経由
npm run build

# または直接実行
node scripts/build.mjs
```

### 2.2. 個別プラグインのビルド
プラグイン ID を引数に渡すことで、指定したプラグインのみをビルドできます。

```powershell
# 論理名プラグインのみビルド
npm run build:logicalname
# または
node scripts/build.mjs logicalname

# ER/Studio プラグインのみビルド
npm run build:erstudio
# または
node scripts/build.mjs erstudio-excel

# Oracle 方言プラグインのみビルド
npm run build:oracle
# または
node scripts/build.mjs oracle-dialect

# その他の方言プラグイン（postgres / mysql / mssql / spanner / snowflake / bigquery / redshift / databricks）
npm run build:postgres
npm run build:mysql
npm run build:mssql
npm run build:spanner
npm run build:snowflake
npm run build:bigquery
npm run build:redshift
npm run build:databricks
```

---

## 3. 本体（`dbml-editor-v2`）への反映方法（任意）

生成された ZIP パッケージは `dist/` にのみ出力され、本体には直接書き込まれません。  
テストや本体環境で動作を確認したい場合のみ、以下のコマンドで手動コピーできます（古いバージョンの ZIP が存在する場合は自動的に置換されます）。

```powershell
# 全プラグインを本体 (dbml-editor-v2/plugins) へ反映
npm run deploy

# 特定のプラグインのみ反映
node scripts/deploy.mjs logicalname
```

---

## 4. プラグインの設計規約

- **`plugin.json`**:
  - `name`, `description` は英語ベースで記述します。
  - 日本語の名称・説明文は `locales/ja.json` の `name` / `description` に記述します。
  - `nameKey: "plugins.<id>.name"` を設定します。
  - `version: "x.y.z"`（セマンティックバージョニング）を必ず定義します（ZIP ファイル名に自動反映されます）。
- **多言語化 (`locales/`)**:
  - `locales/en.json` (必須)
  - `locales/ja.json` (推奨)
  - 論理名サポート機能を提供するプラグインは `logicalName: { table, tablePlaceholder, column, columnPlaceholder, erdModeOption }` を定義します。

---

## 5. コントリビューション・開発参加について (Contributing & Contact)

### 🇯🇵 日本語 (Primary Language)
本プロジェクトは日本語をメイン言語として開発・運営しています。将来的にこのツールを一緒に育ててくださる開発仲間が集まってくれたら嬉しく思います！

* **コンタクト・開発参加のご相談は歓迎です**:
  「一緒に開発に参加したい」「新しいプラグインや改善案を相談したい」といったご連絡は大歓迎です。作業に着手される前に、まずは Issue または Discussions でお気軽にコンタクトしてください。
* **お願いとご注意**:
  * **事前相談のない突然の Pull Request**（「勝手に直しました！」等のコード送信）はマージいたしかねます。必ず事前に方針をご相談ください。
  * 本ツールは無償で公開しているプロジェクトであり、サポート窓口ではありません。**「あれを直せ」「この機能を追加しろ」といった一方的な要求・要望には対応いたしかねます**ので、あらかじめご了承ください。

### 🌐 English
Please note that **Japanese is the primary language** used for the development, documentation, and communication of this project.

* **Contact & Collaboration Welcome**:
  We welcome developers who are interested in collaborating and growing this tool together! If you would like to contribute or discuss ideas, please **contact us first** via Issues or Discussions before writing or submitting any code.
* **Important Guidelines**:
  * **Unsolicited Pull Requests without prior discussion/agreement will not be accepted.** Please reach out and align on the design before submitting a PR.
  * This software is provided "as-is" without official support obligations. **We do not accept one-sided feature demands or fix requests.** Thank you for your understanding.

---

> ※ 本プラグイン群および DBML Editor v2 は、`@dbml/core`（dbml/core）を開発・提供するプロジェクトとは一切関係のない、独立したツールです。  
> ※ 本ドキュメントに記載されている製品名・サービス名（Oracle、ER/Studio、SQL Server、Google Cloud Spanner、Snowflake、BigQuery、Redshift、Databricks 等）は各社の商標または登録商標であり、本ツールはこれらの開発元・提供元と提携・承認関係にあるものではありません。
