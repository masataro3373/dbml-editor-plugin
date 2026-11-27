// 日本語コメント: Google Cloud Spanner 方言設定 (plugins/spanner-dialect/config.js)

export const spannerMetadataDef = {
  projectAttributes: [],
  tableAttributes: [
    {
      key: 'interleave_in_parent',
      labelKey: 'attributes.interleaveInParent',
      type: 'string',
      default: '',
      scope: 'dialect',
      targetDialect: 'spanner',
      group: 'physical',
    },
    {
      key: 'on_delete_action',
      labelKey: 'attributes.onDeleteAction',
      type: 'select',
      options: [
        { label: '指定なし (NO ACTION)', value: '' },
        { label: 'CASCADE', value: 'CASCADE' },
        { label: 'NO ACTION', value: 'NO ACTION' },
      ],
      default: '',
      scope: 'dialect',
      targetDialect: 'spanner',
      group: 'physical',
    },
    {
      key: 'row_deletion_policy',
      labelKey: 'attributes.rowDeletionPolicy',
      type: 'string',
      default: '',
      scope: 'dialect',
      targetDialect: 'spanner',
      group: 'physical',
    },
  ],
  columnAttributes: [],
};

export const spannerConfig = {
  id: 'spanner',
  displayName: 'Google Cloud Spanner',
  dbmlDatabaseType: 'Cloud Spanner',
  dbmlCoreType: 'postgres',
  maxIdentifierLength: 128,
  supportsIdentity: false,
  namingRules: {
    autoConvertUpper: false,
  },
  getDefaultColumnType(isPk = false) {
    return isPk ? 'STRING(36)' : 'STRING(255)';
  },
  dataTypes: [
    { name: 'BOOL' },
    { name: 'INT64' },
    { name: 'FLOAT64' },
    { name: 'NUMERIC' },
    { name: 'STRING', hasLength: true, defaultLength: 255 },
    { name: 'STRING(MAX)' },
    { name: 'BYTES', hasLength: true, defaultLength: 255 },
    { name: 'BYTES(MAX)' },
    { name: 'DATE' },
    { name: 'TIMESTAMP' },
    { name: 'JSON' },
  ],
  reservedWords: new Set([
    'ALL', 'AND', 'ANY', 'ARRAY', 'AS', 'ASC', 'ASSERT_ROWS_MODIFIED', 'AT', 'BETWEEN',
    'BY', 'CASE', 'CAST', 'COLLATE', 'CONTAINS', 'CREATE', 'CROSS', 'CUBE', 'CURRENT',
    'DEFAULT', 'DEFINE', 'DESC', 'DISTINCT', 'ELSE', 'END', 'ENUM', 'ESCAPE', 'EXCEPT',
    'EXCLUDE', 'EXISTS', 'EXTRACT', 'FALSE', 'FETCH', 'FOLLOWING', 'FOR', 'FROM', 'FULL',
    'GROUP', 'GROUPING', 'GROUPS', 'HASH', 'HAVING', 'IF', 'IGNORE', 'IN', 'INNER',
    'INTERLEAVE', 'INTERSECT', 'INTERVAL', 'INTO', 'IS', 'JOIN', 'LATERAL', 'LEFT',
    'LIKE', 'LIMIT', 'LOOKUP', 'MERGE', 'NATURAL', 'NEW', 'NO', 'NOT', 'NULL', 'NULLS',
    'OF', 'ON', 'OR', 'ORDER', 'OUTER', 'OVER', 'PARENT', 'PARTITION', 'PRECEDING',
    'PRIMARY', 'PROTO', 'RANGE', 'RECURSIVE', 'RESPECT', 'RIGHT', 'ROLLUP', 'ROWS',
    'SELECT', 'SET', 'SOME', 'STRUCT', 'TABLESAMPLE', 'THEN', 'TO', 'TREAT', 'TRUE',
    'UNBOUNDED', 'UNION', 'UNNEST', 'USING', 'WHEN', 'WHERE', 'WINDOW', 'WITH', 'WITHIN',
  ]),
};
