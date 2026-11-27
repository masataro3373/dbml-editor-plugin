// 日本語コメント: Oracle 方言設定 (plugins/oracle-dialect/config.js)
// Oracle (12c+ / 11g) の方言仕様および物理メタデータ属性定義を提供します。

// ① 物理メタデータ属性定義 (Project 3項目 + Table 6項目)
export const oracleMetadataDef = {
  projectAttributes: [
    {
      key: 'data_tablespaces',
      labelKey: 'attributes.dataTablespaces',
      hintKey: 'attributes.hintTablespaces',
      type: 'list',
      scope: 'dialect',
      targetDialect: 'oracle',
    },
    {
      key: 'index_tablespaces',
      labelKey: 'attributes.indexTablespaces',
      hintKey: 'attributes.hintTablespaces',
      type: 'list',
      scope: 'dialect',
      targetDialect: 'oracle',
    },
    {
      key: 'lob_tablespaces',
      labelKey: 'attributes.lobTablespaces',
      hintKey: 'attributes.hintTablespaces',
      type: 'list',
      scope: 'dialect',
      targetDialect: 'oracle',
    },
  ],
  tableAttributes: [
    // 日本語コメント: テーブル種別 (通常テーブル / GLOBAL TEMPORARY / PRIVATE TEMPORARY)
    {
      key: 'table_type',
      labelKey: 'attributes.tableType',
      type: 'select',
      options: [
        { label: '通常テーブル (NORMAL)', value: '' },
        { label: 'グローバル一時テーブル (GLOBAL TEMPORARY)', value: 'GLOBAL TEMPORARY' },
        { label: 'プライベート一時テーブル (PRIVATE TEMPORARY)', value: 'PRIVATE TEMPORARY' },
      ],
      default: '',
      showBadge: true,
      scope: 'dialect',
      targetDialect: 'oracle',
      group: 'physical',
    },
    // 日本語コメント: 一時テーブルのコミット時動作 (ON COMMIT DELETE ROWS / PRESERVE ROWS)
    {
      key: 'on_commit',
      labelKey: 'attributes.onCommit',
      type: 'select',
      options: [
        { label: '指定なし (デフォルト)', value: '' },
        { label: 'ON COMMIT DELETE ROWS (コミット時行削除)', value: 'DELETE ROWS' },
        { label: 'ON COMMIT PRESERVE ROWS (コミット時行保持)', value: 'PRESERVE ROWS' },
      ],
      default: '',
      scope: 'dialect',
      targetDialect: 'oracle',
      group: 'physical',
    },
    {
      key: 'tablespace',
      labelKey: 'attributes.tablespace',
      type: 'string',
      // 日本語コメント: 明示的な表領域指定がない場合は空（未指定）とする (勝手なUSERS補完を防止)
      default: '',
      suggestFromProjectKey: 'data_tablespaces',
      showBadge: true,
      scope: 'dialect',
      targetDialect: 'oracle',
      group: 'physical',
    },
    {
      key: 'index_tablespace',
      labelKey: 'attributes.indexTablespace',
      type: 'string',
      default: '',
      suggestFromProjectKey: 'index_tablespaces',
      scope: 'dialect',
      targetDialect: 'oracle',
      group: 'physical',
    },
    {
      key: 'lob_tablespace',
      labelKey: 'attributes.lobTablespace',
      type: 'string',
      default: '',
      suggestFromProjectKey: 'lob_tablespaces',
      scope: 'dialect',
      targetDialect: 'oracle',
      group: 'physical',
    },
    {
      key: 'pctfree',
      labelKey: 'attributes.pctfree',
      type: 'number',
      default: 10,
      scope: 'dialect',
      targetDialect: 'oracle',
      group: 'physical',
    },
    {
      key: 'initrans',
      labelKey: 'attributes.initrans',
      type: 'number',
      default: 1,
      scope: 'dialect',
      targetDialect: 'oracle',
      group: 'physical',
    },
    {
      key: 'logging',
      labelKey: 'attributes.logging',
      type: 'boolean',
      default: true,
      scope: 'dialect',
      targetDialect: 'oracle',
      group: 'physical',
    },
  ],
  columnAttributes: [],
};

// ② Oracle 共通ベース設定
const baseOracleConfig = {
  dbmlCoreType: 'oracle',
  namingRules: {
    autoConvertUpper: true, // 入力時の大文字化
  },
  getDefaultColumnType(isPk = false) {
    return isPk ? 'NUMBER(10)' : 'VARCHAR2(100)';
  },
  dataTypes: [
    { name: 'VARCHAR2', hasLength: true, hasUnit: true, defaultLength: 100 },
    { name: 'NVARCHAR2', hasLength: true, defaultLength: 100 },
    { name: 'NUMBER', hasPrecision: true, hasScale: true },
    { name: 'INTEGER' },
    { name: 'DATE' },
    { name: 'TIMESTAMP', hasPrecision: true },
    { name: 'TIMESTAMP WITH TIME ZONE', hasPrecision: true },
    { name: 'CLOB' },
    { name: 'NCLOB' },
    { name: 'BLOB' },
    { name: 'RAW', hasLength: true },
  ],
  reservedWords: new Set([
    'ACCESS', 'ADD', 'ALL', 'ALTER', 'AND', 'ANY', 'AS', 'ASC', 'AUDIT', 'BETWEEN', 'BY',
    'CHAR', 'CHECK', 'CLUSTER', 'COLUMN', 'COMMENT', 'COMPRESS', 'CONNECT', 'CREATE', 'CURRENT',
    'DATE', 'DECIMAL', 'DEFAULT', 'DELETE', 'DESC', 'DISTINCT', 'DROP', 'ELSE', 'EXCLUSIVE',
    'EXISTS', 'FILE', 'FLOAT', 'FOR', 'FROM', 'GRANT', 'GROUP', 'HAVING', 'IDENTIFIED',
    'IMMEDIATE', 'IN', 'INCREMENT', 'INDEX', 'INITIAL', 'INSERT', 'INTEGER', 'INTERSECT',
    'INTO', 'IS', 'LEVEL', 'LIKE', 'LOCK', 'LONG', 'MAXEXTENTS', 'MINUS', 'MLSLABEL', 'MODE',
    'MODIFY', 'NOAUDIT', 'NOCOMPRESS', 'NOT', 'NOWAIT', 'NULL', 'NUMBER', 'OF', 'OFFLINE',
    'ON', 'ONLINE', 'OPTION', 'OR', 'ORDER', 'PCTFREE', 'PRIOR', 'PRIVILEGES', 'PUBLIC',
    'RAW', 'RENAME', 'RESOURCE', 'REVOKE', 'ROW', 'ROWID', 'ROWNUM', 'ROWS', 'SELECT',
    'SESSION', 'SET', 'SHARE', 'SIZE', 'SMALLINT', 'START', 'SUCCESSFUL', 'SYNONYM', 'SYSDATE',
    'TABLE', 'THEN', 'TO', 'TRIGGER', 'UID', 'UNION', 'UNIQUE', 'UPDATE', 'USER', 'VALIDATE',
    'VALUES', 'VARCHAR', 'VARCHAR2', 'VIEW', 'WHENEVER', 'WHERE', 'WITH',
  ]),
};

// ③ Oracle (12c+) 設定 (128文字制限, IDENTITY対応)
export const oracle12cConfig = {
  ...baseOracleConfig,
  id: 'oracle_12c',
  displayName: 'Oracle (12c+)',
  dbmlDatabaseType: 'Oracle (12c+)',
  maxIdentifierLength: 128,
  supportsIdentity: true,
};

// ④ Oracle (<= 11g) 設定 (30文字制限, SEQUENCE+TRIGGER)
export const oracle11gConfig = {
  ...baseOracleConfig,
  id: 'oracle_11g',
  displayName: 'Oracle (<= 11g)',
  dbmlDatabaseType: 'Oracle (<= 11g)',
  maxIdentifierLength: 30,
  supportsIdentity: false,
};

