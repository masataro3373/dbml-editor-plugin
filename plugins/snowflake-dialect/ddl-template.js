// 日本語コメント: Snowflake DDL エクスポート EJS テンプレート文字列 (plugins/snowflake-dialect/ddl-template.js)

export const ddlExportTemplate = `<% const targetTables = typeof tables !== 'undefined' && Array.isArray(tables) ? tables : (typeof table !== 'undefined' ? [table] : []); -%>
<%
function formatSqlDefault(val, dataType) {
  if (val === undefined || val === null) return '';
  const raw = (typeof val === 'object' && val !== null && 'value' in val) ? val.value : val;
  if (raw === undefined || raw === null || String(raw).trim() === '') return '';
  const strVal = String(raw).trim();
  if (strVal.startsWith("'") && strVal.endsWith("'")) {
    return strVal;
  }
  const typeStr = typeof dataType === 'string' ? dataType : (dataType ? (dataType.type_name || '') : '');
  const isStringType = /^(VARCHAR|STRING|TEXT|CHAR)/i.test(typeStr.trim());
  if (isStringType) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  const lower = strVal.toLowerCase();
  if (['true', 'false', 'null'].includes(lower)) return lower.toUpperCase();
  if (/^(current_timestamp|current_date|uuid_string\\(\\)|seq)/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
    return strVal;
  }
  if (!isNaN(Number(strVal))) return strVal;
  return "'" + strVal.replace(/'/g, "''") + "'";
}

function getCommentText(obj, source) {
  if (!obj) return '';
  let txt = '';
  if (source === 'note') {
    txt = typeof obj.note === 'object' ? (obj.note.value || '') : (obj.note || '');
  } else if (source === 'both') {
    const logical = obj.logicalName || '';
    const note = typeof obj.note === 'object' ? (obj.note.value || '') : (obj.note || '');
    txt = (logical && note && logical !== note) ? (logical + ': ' + note) : (logical || note);
  } else {
    txt = obj.logicalName || '';
  }
  if (txt.includes('<!-- custom -->')) {
    txt = txt.split('<!-- custom -->')[0].trim();
  }
  txt = txt.trim();
  return txt ? txt.replace(/'/g, "''") : '';
}

function getQualifiedTableName(tbl) {
  const schema = tbl.custom && tbl.custom.schema ? String(tbl.custom.schema).trim() : '';
  return schema ? ('"' + schema + '"."' + tbl.name + '"') : ('"' + tbl.name + '"');
}
-%>
<% if (options.includeDelete && (options.deletePosition === 'top' || !options.deletePosition)) { -%>
-- ==========================================
-- DROP TABLE STATEMENTS
-- ==========================================
<% targetTables.forEach(t => { -%>
DROP TABLE IF EXISTS <%- getQualifiedTableName(t) %>;
<% }) -%>

<% } -%>
<% targetTables.forEach(t => { -%>
<% const qTableName = getQualifiedTableName(t); -%>
<% if (options.includeDelete && options.deletePosition === 'inline') { -%>
DROP TABLE IF EXISTS <%- qTableName %>;
<% } -%>

-- <%= t.name %><%- t.logicalName ? ' (' + t.logicalName + ')' : '' %>
CREATE TABLE <%- qTableName %> (
<% const tableCols = t.columns || t.fields || []; -%>
<% let pkCols = []; -%>
<% let pkName = 'PK_' + t.name.toUpperCase(); -%>
<% const pkIndex = t.indexes ? t.indexes.find(idx => idx.pk || idx.type === 'primary') : null; -%>
<% if (pkIndex) { -%>
<%   pkName = pkIndex.name || pkName; -%>
<%   const rawPkCols = pkIndex.columns || pkIndex.fields || []; -%>
<%   pkCols = rawPkCols.map(c => typeof c === 'object' ? (c.value || c.name || '') : String(c)).filter(Boolean); -%>
<% } else { -%>
<%   pkCols = tableCols.filter(f => f.pk).map(f => f.name); -%>
<% } -%>
<% tableCols.forEach((field, index) => { -%>
<%   const rawDefVal = !field.increment ? ((field.dbdefault !== null && field.dbdefault !== undefined && field.dbdefault !== '') ? field.dbdefault : (field.default !== undefined ? field.default : '')) : ''; -%>
<%   const formattedDefVal = formatSqlDefault(rawDefVal, field.dataType || field.type); -%>
<%   const colComment = options.includeComment ? getCommentText(field, options.commentSource) : ''; -%>
  "<%= field.name %>" <%= field.type %><% if (field.increment) { %> AUTOINCREMENT<% } %><% if (formattedDefVal) { %> DEFAULT <%- formattedDefVal %><% } %><% if (field.not_null || field.notNull || field.pk) { %> NOT NULL<% } %><% if (colComment) { %> COMMENT '<%- colComment %>'<% } %><% if (index < tableCols.length - 1 || pkCols.length > 0) { %>,<% } %>
<% }) -%>
<% if (pkCols.length > 0) { -%>
  CONSTRAINT "<%= pkName %>" PRIMARY KEY (<%- pkCols.map(c => '"' + c + '"').join(', ') %>)
<% } -%>
)<%
  const clusterBy = (t.custom && t.custom.cluster_by) ? t.custom.cluster_by : '';
  const retention = (t.custom && t.custom.data_retention_time_in_days !== undefined && t.custom.data_retention_time_in_days !== '') ? t.custom.data_retention_time_in_days : '';
  const tblComment = options.includeComment ? getCommentText(t, options.commentSource) : '';
-%><% if (clusterBy) { %>
CLUSTER BY (<%= clusterBy %>)<% } %><% if (retention !== '') { %>
DATA_RETENTION_TIME_IN_DAYS = <%= retention %><% } %><% if (tblComment) { %>
COMMENT = '<%- tblComment %>'<% } %>;

<% }) -%>

<% if (typeof refs !== 'undefined' && Array.isArray(refs) && refs.length > 0) { -%>
-- ==========================================
-- FOREIGN KEY CONSTRAINTS (Informational)
-- ==========================================
<% const targetNamesSet = new Set(targetTables.map(t => t.name)); -%>
<% refs.forEach(ref => { -%>
<%   if (ref.endpoints && ref.endpoints.length === 2) { -%>
<%     const ep1 = ref.endpoints[0]; const ep2 = ref.endpoints[1]; -%>
<%     let childEp = ep1; let parentEp = ep2; -%>
<%     if (ep2.relation === '*' || ep1.relation === '1') { childEp = ep2; parentEp = ep1; } -%>
<%     if (targetNamesSet.has(childEp.tableName)) { -%>
<%       const cCols = (childEp.fieldNames || []).map(f => '"' + f + '"').join(', '); -%>
<%       const pCols = (parentEp.fieldNames || []).map(f => '"' + f + '"').join(', '); -%>
<%       const fkName = ref.name || ('FK_' + childEp.tableName + '_' + (childEp.fieldNames || []).join('_')); -%>
ALTER TABLE "<%= childEp.tableName %>" ADD CONSTRAINT "<%= fkName %>" FOREIGN KEY (<%- cCols %>) REFERENCES "<%= parentEp.tableName %>" (<%- pCols %>);
<%     } -%>
<%   } -%>
<% }) -%>
<% } -%>
`;
