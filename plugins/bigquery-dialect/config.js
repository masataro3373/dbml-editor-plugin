// 日本語コメント: Google BigQuery 方言設定 (plugins/bigquery-dialect/config.js)

export const bigqueryMetadataDef = {
  projectAttributes: [],
  tableAttributes: [
    {
      key: 'dataset',
      labelKey: 'attributes.dataset',
      type: 'string',
      default: 'my_dataset',
      scope: 'dialect',
      targetDialect: 'bigquery',
      group: 'physical',
    },
    {
      key: 'partition_by',
      labelKey: 'attributes.partitionBy',
      type: 'string',
      default: '',
      scope: 'dialect',
      targetDialect: 'bigquery',
      group: 'physical',
    },
    {
      key: 'cluster_by',
      labelKey: 'attributes.clusterBy',
      type: 'string',
      default: '',
      scope: 'dialect',
      targetDialect: 'bigquery',
      group: 'physical',
    },
  ],
  columnAttributes: [],
};

export const bigqueryConfig = {
  id: 'bigquery',
  displayName: 'Google BigQuery',
  dbmlDatabaseType: 'BigQuery',
  dbmlCoreType: 'postgres',
  maxIdentifierLength: 1024,
  supportsIdentity: false,
  namingRules: {
    autoConvertUpper: false,
  },
  getDefaultColumnType(isPk = false) {
    return isPk ? 'INT64' : 'STRING';
  },
  dataTypes: [
    { name: 'STRING', hasLength: true },
    { name: 'INT64' },
    { name: 'FLOAT64' },
    { name: 'NUMERIC', hasPrecision: true, hasScale: true },
    { name: 'BIGNUMERIC', hasPrecision: true, hasScale: true },
    { name: 'BOOL' },
    { name: 'DATE' },
    { name: 'DATETIME' },
    { name: 'TIME' },
    { name: 'TIMESTAMP' },
    { name: 'BYTES', hasLength: true },
    { name: 'JSON' },
    { name: 'GEOGRAPHY' },
  ],
  reservedWords: new Set([
    'ALL', 'AND', 'ANY', 'ARRAY', 'AS', 'ASC', 'ASSERT_ROWS_MODIFIED', 'AT', 'BETWEEN',
    'BY', 'CASE', 'CAST', 'COLLATE', 'CONTAINS', 'CREATE', 'CROSS', 'CUBE', 'CURRENT',
    'DEFAULT', 'DEFINE', 'DESC', 'DISTINCT', 'ELSE', 'END', 'ENUM', 'ESCAPE', 'EXCEPT',
    'EXCLUDE', 'EXISTS', 'EXTRACT', 'FALSE', 'FETCH', 'FOLLOWING', 'FOR', 'FROM', 'FULL',
    'GROUP', 'GROUPING', 'GROUPS', 'HASH', 'HAVING', 'IF', 'IGNORE', 'IN', 'INNER',
    'INTERSECT', 'INTERVAL', 'INTO', 'IS', 'JOIN', 'LATERAL', 'LEFT', 'LIKE', 'LIMIT',
    'LOOKUP', 'MERGE', 'NATURAL', 'NEW', 'NO', 'NOT', 'NULL', 'NULLS', 'OF', 'ON', 'OR',
    'ORDER', 'OUTER', 'OVER', 'PARTITION', 'PRECEDING', 'PROTO', 'QUALIFY', 'RANGE',
    'RECURSIVE', 'RESPECT', 'RIGHT', 'ROLLUP', 'ROWS', 'SELECT', 'SET', 'SOME', 'STRUCT',
    'TABLESAMPLE', 'THEN', 'TO', 'TREAT', 'TRUE', 'UNBOUNDED', 'UNION', 'UNNEST',
    'USING', 'WHEN', 'WHERE', 'WINDOW', 'WITH', 'WITHIN',
  ]),
};
