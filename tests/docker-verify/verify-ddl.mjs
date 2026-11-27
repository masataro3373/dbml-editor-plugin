// 日本語コメント: 起動中の Docker コンテナに対して各プラグインが生成した DDL / マイグレーション SQL を流し込み実機検証するスクリプト
// 使用例: node tests/docker-verify/verify-ddl.mjs postgres

import { spawnSync } from 'node:child_process';
import { loadAndActivatePlugin } from '../helpers/plugin-driver.js';

const TARGETS = {
  postgres: {
    pluginId: 'postgres-dialect',
    container: 'dbml-verify-postgres',
    types: { int: 'INTEGER', varchar: 'VARCHAR(100)', bool: 'BOOLEAN', boolDefault: 'true' },
    execSql: (sql) => spawnSync('docker', ['exec', '-i', 'dbml-verify-postgres', 'psql', '-U', 'postgres', '-d', 'verifydb', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' }),
  },
  mysql: {
    pluginId: 'mysql-dialect',
    container: 'dbml-verify-mysql',
    types: { int: 'INT', varchar: 'VARCHAR(100)', bool: 'TINYINT(1)', boolDefault: '1' },
    execSql: (sql) => spawnSync('docker', ['exec', '-i', 'dbml-verify-mysql', 'mysql', '-uroot', '-pverifypass', 'verifydb'], { input: sql, encoding: 'utf8' }),
  },
  oracle: {
    pluginId: 'oracle-dialect',
    container: process.env.ORACLE_CONTAINER || 'dbml-verify-oracle',
    types: { int: 'NUMBER(10)', varchar: 'VARCHAR2(100)', bool: 'NUMBER(1)', boolDefault: '1' },
    execSql: (sql) => {
      const container = process.env.ORACLE_CONTAINER || 'dbml-verify-oracle';
      const conn = process.env.ORACLE_CONN || 'verifyuser/verifypass@//localhost:1521/FREEPDB1';
      const wrapped = `WHENEVER SQLERROR EXIT SQL.SQLCODE\n${sql}\nEXIT;\n`;
      return spawnSync('docker', ['exec', '-i', container, 'sqlplus', '-s', conn], { input: wrapped, encoding: 'utf8' });
    },
  },
  mssql: {
    pluginId: 'mssql-dialect',
    container: 'dbml-verify-mssql',
    types: { int: 'INT', varchar: 'NVARCHAR(100)', bool: 'BIT', boolDefault: '1' },
    execSql: (sql) => spawnSync('docker', ['exec', '-i', 'dbml-verify-mssql', '/opt/mssql-tools18/bin/sqlcmd', '-S', 'localhost', '-U', 'sa', '-P', 'VerifyPass123!', '-C', '-b'], { input: sql, encoding: 'utf8' }),
  },
  spanner: {
    pluginId: 'spanner-dialect',
    container: 'dbml-verify-spanner',
    types: { int: 'INT64', varchar: 'STRING(100)', bool: 'BOOL', boolDefault: 'true' },
    execSqlAsync: async (sql) => {
      const base = process.env.SPANNER_EMULATOR_REST || 'http://localhost:19020';
      // インスタンス・DB が未作成なら作成（409 ALREADY_EXISTS は無視）
      await fetch(`${base}/v1/projects/test-project/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId: 'test-instance',
          instance: { config: 'projects/test-project/instanceConfigs/emulator-config', displayName: 'Test', nodeCount: 1 },
        }),
      });
      await fetch(`${base}/v1/projects/test-project/instances/test-instance/databases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createStatement: 'CREATE DATABASE `verifydb`' }),
      });

      // コメント行を除去し ';' で文分割
      const statements = sql
        .split(';')
        .map(s => s.split(/\r?\n/).filter(line => !line.trim().startsWith('--')).join('\n').trim())
        .filter(Boolean);

      if (statements.length === 0) return { status: 0, stdout: '', stderr: '' };
      // DML (INSERT INTO 等) のみの場合は UpdateDatabaseDdl 対象外のためスキップ
      if (statements.every(s => /^INSERT\s+/i.test(s))) {
        console.log('    (DML スクリプトのため DDL 検証スキップ)');
        return { status: 0, stdout: '', stderr: '' };
      }

      const res = await fetch(`${base}/v1/projects/test-project/instances/test-instance/databases/verifydb/ddl`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statements }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        return { status: 1, stdout: '', stderr: JSON.stringify(data.error || data, null, 2) };
      }
      return { status: 0, stdout: 'OK', stderr: '' };
    },
  },
};

function createTestModel(types, upper = false) {
  const id = (s) => upper ? s.toUpperCase() : s;
  return {
    project: { name: 'docker_verify' },
    tables: [
      {
        name: id('verify_users'),
        logicalName: '検証ユーザー',
        note: '検証用テーブル',
        fields: [
          { name: id('id'), type: types.int, pk: true, not_null: true, increment: true, logicalName: 'ID' },
          { name: id('email'), type: types.varchar, not_null: true, dbdefault: 'test@example.com', logicalName: 'メール' },
          { name: id('active_flag'), type: types.bool, not_null: true, dbdefault: types.boolDefault, logicalName: '有効フラグ' },
        ],
        indexes: [
          { name: id('idx_verify_users_email'), unique: true, columns: [id('email')] },
        ],
      },
      {
        name: id('verify_orders'),
        logicalName: '検証注文',
        note: '注文履歴',
        fields: [
          { name: id('order_id'), type: types.int, pk: true, not_null: true, increment: true, logicalName: '注文ID' },
          { name: id('user_id'), type: types.int, not_null: true, logicalName: 'ユーザーID' },
        ],
        indexes: [],
      },
    ],
    refs: [
      {
        name: id('fk_verify_orders_user'),
        onDelete: 'CASCADE',
        endpoints: [
          { tableName: id('verify_orders'), fieldNames: [id('user_id')], relation: '*' },
          { tableName: id('verify_users'), fieldNames: [id('id')], relation: '1' },
        ],
      },
    ],
  };
}

function createMigrationDiff(types, upper = false) {
  const id = (s) => upper ? s.toUpperCase() : s;
  return {
    tables: [
      {
        name: id('verify_orders'),
        status: 'MODIFIED',
        migrationMode: 'RECREATE_TABLE',
        oldTable: {
          name: id('verify_orders'),
          fields: [
            { name: id('order_id'), type: types.int, pk: true, not_null: true, increment: true },
            { name: id('user_id'), type: types.int, not_null: true },
          ],
          indexes: [],
        },
        newTable: {
          name: id('verify_orders'),
          fields: [
            { name: id('order_id'), type: types.int, pk: true, not_null: true, increment: true },
            { name: id('user_id'), type: types.int, not_null: true },
            { name: id('status'), type: types.varchar, not_null: true, dbdefault: 'NEW' },
          ],
          indexes: [],
        },
        alignedFks: [],
      },
    ],
  };
}

async function main() {
  const targetName = process.argv[2];
  if (!targetName || !TARGETS[targetName]) {
    console.error(`使用方法: node tests/docker-verify/verify-ddl.mjs <${Object.keys(TARGETS).join('|')}>`);
    process.exit(1);
  }

  const cfg = TARGETS[targetName];
  console.log(`\n=== [${targetName}] プラグイン (${cfg.pluginId}) 実機 DDL 検証開始 ===`);

  const { registeredDialects } = await loadAndActivatePlugin(cfg.pluginId);
  const dialect = registeredDialects[0];
  if (!dialect || !dialect.exporter) {
    throw new Error(`[${cfg.pluginId}] dialect または exporter が見つかりません`);
  }

  const isOracle = targetName === 'oracle';
  const model = createTestModel(cfg.types, isOracle);

  // 1. エクスポート DDL 実行（Oracle / Spanner は初回テーブル未存在時の DROP TABLE 失敗を避けるため includeDelete: false）
  const preprocessed = await dialect.exporter.preprocess(model, {});
  const rendered = await dialect.exporter.process(preprocessed, {
    includeDelete: targetName !== 'oracle' && targetName !== 'spanner',
    deletePosition: 'top',
    includeComment: true,
    commentPosition: 'bottom',
    commentSource: 'both',
  });
  const exported = await dialect.exporter.postprocess(rendered, {}, {});
  const exportSql = exported.content;

  const runExec = async (sql) => (cfg.execSqlAsync ? await cfg.execSqlAsync(sql) : cfg.execSql(sql));

  console.log('\n--- 1. エクスポート DDL 実行 ---');
  const exportRes = await runExec(exportSql);
  if (exportRes.status !== 0) {
    console.error('❌ エクスポート DDL 実行失敗:');
    console.error(exportRes.stdout || '');
    console.error(exportRes.stderr || '');
    process.exit(1);
  }
  console.log('✔ エクスポート DDL 実行成功');

  // 2. マイグレーション SQL (RECREATE_TABLE) 実行
  if (typeof dialect.migrationGenerator === 'function') {
    console.log('\n--- 2. マイグレーション SQL (RECREATE_TABLE) 実行 ---');
    const diff = createMigrationDiff(cfg.types, isOracle);
    const scriptsByTable = dialect.migrationGenerator(diff, [], {
      includeComment: true,
      commentSource: 'both',
    });
    const tableKey = Object.keys(scriptsByTable).find(k => k.toLowerCase() === 'verify_orders');
    const scripts = tableKey ? scriptsByTable[tableKey] : [];
    for (const script of scripts) {
      console.log(`  実行中: ${script.filename}`);
      const res = await runExec(script.content);
      if (res.status !== 0) {
        console.error(`❌ マイグレーション失敗 (${script.filename}):`);
        console.error(res.stdout || '');
        console.error(res.stderr || '');
        process.exit(1);
      }
    }
    console.log('✔ マイグレーション SQL 全ステップ実行成功');
  }

  console.log(`\n🎉 [${targetName}] 実機検証 PASS\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
