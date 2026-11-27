// 日本語コメント: 全方言プラグインの DDL エクスポート (EJS テンプレート評価含む) 自動テスト

import test from 'node:test';
import assert from 'node:assert/strict';
import { listPluginIds, loadAndActivatePlugin } from './helpers/plugin-driver.js';

/**
 * 日本語コメント: テスト用の共通サンプルモデル（テーブル、PK、DEFAULT値、インデックス、外部キー、コメント含む）
 */
function createSampleModel() {
  return {
    project: { name: 'sample_project' },
    tables: [
      {
        name: 'users',
        logicalName: 'ユーザーマスタ',
        note: 'ユーザー情報を管理するテーブル',
        custom: {
          schema: 'app_schema',
          dataset: 'app_dataset',
        },
        fields: [
          { name: 'id', type: 'INT', pk: true, not_null: true, increment: true, logicalName: 'ユーザーID' },
          { name: 'email', type: 'VARCHAR(255)', not_null: true, dbdefault: 'guest@example.com', logicalName: 'メールアドレス' },
          { name: 'is_active', type: 'BOOLEAN', not_null: true, dbdefault: 'true', logicalName: '有効フラグ' },
          { name: 'retry_count', type: 'INT', not_null: false, dbdefault: '0', logicalName: 'リトライ回数' },
        ],
        indexes: [
          { name: 'idx_users_email', unique: true, columns: ['email'] },
        ],
      },
      {
        name: 'orders',
        logicalName: '注文テーブル',
        note: '注文履歴',
        fields: [
          { name: 'order_id', type: 'INT', pk: true, not_null: true, increment: true, logicalName: '注文ID' },
          { name: 'user_id', type: 'INT', not_null: true, logicalName: 'ユーザーID' },
        ],
        indexes: [],
      },
    ],
    refs: [
      {
        name: 'fk_orders_user_id',
        onDelete: 'CASCADE',
        endpoints: [
          { tableName: 'orders', fieldNames: ['user_id'], relation: '*' },
          { tableName: 'users', fieldNames: ['id'], relation: '1' },
        ],
      },
    ],
  };
}

const pluginIds = listPluginIds();

for (const pluginId of pluginIds) {
  test(`[${pluginId}] 方言プラグインの DDL エクスポートが構文エラーなく SQL を生成する`, async (t) => {
    const res = await loadAndActivatePlugin(pluginId);
    if (res.registeredDialects.length === 0) {
      t.skip('方言プラグインではないためスキップ');
      return;
    }

    const model = createSampleModel();

    for (const dialect of res.registeredDialects) {
      assert.ok(dialect.exporter, `[${dialect.id}] exporter が存在しません`);
      const preprocessed = await dialect.exporter.preprocess(model, {});
      const rendered = await dialect.exporter.process(preprocessed, {
        includeDelete: true,
        deletePosition: 'top',
        includeComment: true,
        commentPosition: 'bottom',
        commentSource: 'logicalName',
      });
      const exported = await dialect.exporter.postprocess(rendered, {}, {});

      assert.equal(typeof exported.content, 'string', `[${dialect.id}] 出力 content が文字列ではありません`);
      assert.ok(exported.content.includes('CREATE TABLE'), `[${dialect.id}] CREATE TABLE が含まれていません`);
      assert.ok(exported.content.includes('users'), `[${dialect.id}] users テーブルが含まれていません`);
      assert.ok(exported.content.includes('orders'), `[${dialect.id}] orders テーブルが含まれていません`);
      assert.ok(exported.content.includes('DEFAULT'), `[${dialect.id}] DEFAULT 句が含まれていません`);
      assert.ok(exported.content.includes('PRIMARY KEY'), `[${dialect.id}] PRIMARY KEY が含まれていません`);
      assert.ok(exported.filename.endsWith('.sql'), `[${dialect.id}] 出力ファイル名が .sql ではありません`);
    }
  });
}
