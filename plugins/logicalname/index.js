// 日本語コメント: 論理名専用プラグイン エントリポイント (plugins/logicalname/index.js)
// ERStudio等の重厚な物理属性やドメインをロードすることなく、
// 純粋にテーブル・カラムの論理名 (logicalName) のみを取り扱う軽量プラグインです。

export default {
  /**
   * プラグイン有効化コールバック
   * @param {Object} context - PluginContext
   */
  activate(context) {
    // メタデータマネージャーに論理名機能の有効化のみを登録
    if (context && context.metadata && typeof context.metadata.registerAttributes === 'function') {
      context.metadata.registerAttributes('logicalname', {
        enableLogicalName: true,
      });
    }
  },
};
