// 日本語コメント: Snowflake 方言設定 (plugins/snowflake-dialect/config.js)

export const snowflakeMetadataDef = {
  projectAttributes: [],
  tableAttributes: [
    {
      key: 'schema',
      labelKey: 'attributes.schema',
      type: 'string',
      default: '',
      scope: 'dialect',
      targetDialect: 'snowflake',
      group: 'physical',
    },
    {
      key: 'cluster_by',
      labelKey: 'attributes.clusterBy',
      type: 'string',
      default: '',
      scope: 'dialect',
      targetDialect: 'snowflake',
      group: 'physical',
    },
    {
      key: 'data_retention_time_in_days',
      labelKey: 'attributes.dataRetention',
      type: 'number',
      default: '',
      scope: 'dialect',
      targetDialect: 'snowflake',
      group: 'physical',
    },
  ],
  columnAttributes: [],
};

export const snowflakeConfig = {
  id: 'snowflake',
  displayName: 'Snowflake',
  dbmlDatabaseType: 'Snowflake',
  dbmlCoreType: 'snowflake',
  maxIdentifierLength: 255,
  supportsIdentity: true,
  namingRules: {
    autoConvertUpper: true,
  },
  getDefaultColumnType(isPk = false) {
    return isPk ? 'NUMBER(38,0)' : 'VARCHAR(255)';
  },
  dataTypes: [
    { name: 'NUMBER', hasPrecision: true, hasScale: true },
    { name: 'INTEGER' },
    { name: 'BIGINT' },
    { name: 'FLOAT' },
    { name: 'VARCHAR', hasLength: true, defaultLength: 255 },
    { name: 'STRING' },
    { name: 'BOOLEAN' },
    { name: 'DATE' },
    { name: 'TIME', hasPrecision: true },
    { name: 'TIMESTAMP_NTZ', hasPrecision: true },
    { name: 'TIMESTAMP_LTZ', hasPrecision: true },
    { name: 'TIMESTAMP_TZ', hasPrecision: true },
    { name: 'BINARY', hasLength: true },
    { name: 'VARIANT' },
    { name: 'OBJECT' },
    { name: 'ARRAY' },
  ],
  reservedWords: new Set([
    'ACCOUNT', 'ALL', 'ALTER', 'AND', 'ANY', 'AS', 'BETWEEN', 'BY', 'CASE', 'CAST',
    'CHECK', 'COLUMN', 'CONNECT', 'CONNECTION', 'CONSTRAINT', 'CREATE', 'CROSS',
    'CURRENT', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'CURRENT_USER',
    'DATABASE', 'DELETE', 'DISTINCT', 'DROP', 'ELSE', 'EXISTS', 'FALSE', 'FOLLOWING',
    'FOR', 'FROM', 'FULL', 'GRANT', 'GROUP', 'GSCLUSTER', 'HAVING', 'ILIKE', 'IN',
    'INCREMENT', 'INNER', 'INSERT', 'INTERSECT', 'INTO', 'IS', 'ISSUE', 'JOIN',
    'LATERAL', 'LEFT', 'LIKE', 'LOCALTIME', 'LOCALTIMESTAMP', 'MINUS', 'NATURAL',
    'NOT', 'NULL', 'OF', 'ON', 'OR', 'ORDER', 'ORGANIZATION', 'QUALIFY', 'REGEXP',
    'REVOKE', 'RIGHT', 'RLIKE', 'ROW', 'ROWS', 'SAMPLE', 'SCHEMA', 'SELECT', 'SET',
    'SOME', 'START', 'TABLE', 'TABLESAMPLE', 'THEN', 'TO', 'TRIGGER', 'TRUE', 'TRY_CAST',
    'UNION', 'UNIQUE', 'UPDATE', 'USING', 'VALUES', 'VIEW', 'WHEN', 'WHENEVER', 'WHERE', 'WITH',
  ]),
};
