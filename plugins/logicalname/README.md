# 論理名サポートプラグイン (`logicalname`)

## 1. プラグイン概要
`logicalname` は、`dbml-editor-v2` においてテーブルおよびカラムの **「論理名（日本語和名・表示名）」** の入力・ER図表示・DBML双方向保存を有効化する軽量プラグインです。

特定の方言（Oracle 等）に依存した物理属性（表領域やストレージ句等）を追加せず、純粋に論理名メタデータ機能のみを提供します。

| 項目 | 内容 |
| :--- | :--- |
| **プラグイン ID** | `logicalname` |
| **パッケージ名** | `logicalname-1.0.0.zip` |
| **バージョン** | `1.0.0` |
| **提供機能 (`capabilities`)** | `metadata` |
| **必須ライブラリ (`requires`)** | なし |

---

## 2. このプラグインが提供する機能

1. **テーブル論理名のサポート**
   - テーブル編集画面およびテーブル一覧で「論理名」を入力・編集できます。
   - ER図上で物理名に加えて論理名が併記されます。
2. **カラム論理名のサポート**
   - テーブル内の各カラムに論理名を設定できます。
3. **DBML 双方向保存・読み込み**
   - DBML 定義のカスタムプロパティ（`logicalName`）として安全に保存・復元されます。

---

## 3. パッケージ構成
```text
logicalname/
├── README.md                 # 本ドキュメント（プラグイン説明書）
├── plugin.json               # プラグインマニフェスト
├── index.js                  # エントリポイント（論理名属性の登録）
└── locales/
    ├── en.json               # 英語翻訳リソース
    └── ja.json               # 日本語翻訳リソース
```

---

## 4. 動作要件・インストール方法
1. **ビルド・インストール**: `npm --prefix dbml-editor-plugin run build:logicalname` で生成した ZIP を `dbml-editor-v2/plugins/` に配置します（または `npm --prefix dbml-editor-plugin run deploy` を実行）。
2. **アンインストール**: `dbml-editor-v2/plugins/logicalname-1.0.0.zip` を削除します。
