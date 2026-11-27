// 日本語コメント: Google BigQuery DDL エクスポート EJS テンプレート文字列 (plugins/bigquery-dialect/ddl-template.js)

export const ddlExportTemplate = `<% const targetTables = typeof tables !== 'undefined' && Array.isArray(tables) ? tables : (typeof table !== 'undefined' ? [table] : []); -%>
<%
function formatSqlDefault(val, dataType) {
  if (val === undefined || val === null) return '';
  const raw = (typeof val === 'object' && val !== null && 'value' in val) ? val.value : val;
  if (raw === undefined || raw === null || String(raw).trim() === '') return '';
  const strVal = String(raw).trim();
  if (strVal.startsWith("'") && strVal.endsWith("'")) return strVal;
  const typeStr = typeof dataType === 'string' ? dataType : (dataType ? (dataType.type_name || '') : '');
  if (/^(STRING)/i.test(typeStr.trim())) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  const lower = strVal.toLowerCase();
  if (['true', 'false', 'null'].includes(lower)) return lower.toUpperCase();
  if (/^(current_timestamp|current_date|current_datetime|generate_uuid\\(\\))/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
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
  return txt ? txt.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"') : '';
}

function getBqTableName(tbl) {
  const ds = tbl.custom && tbl.custom.dataset ? String(tbl.custom.dataset).trim() : 'my_dataset';
  return '\`' + ds + '.' + tbl.name + '\`';
}
-%>
<% if (options.includeDelete && (options.deletePosition === 'top' || !options.deletePosition)) { -%>
-- ==========================================
-- DROP TABLE STATEMENTS
-- ==========================================
<% targetTables.forEach(t => { -%>
DROP TABLE IF EXISTS <%- getBqTableName(t) %>;
<% }) -%>

<% } -%>
<% targetTables.forEach(t => { -%>
<% const qTableName = getBqTableName(t); -%>
<% if (options.includeDelete && options.deletePosition === 'inline') { -%>
DROP TABLE IF EXISTS <%- qTableName %>;
<% } -%>

-- <%= t.name %><%- t.logicalName ? ' (' + t.logicalName + ')' : '' %>
CREATE TABLE <%- qTableName %> (
<% const tableCols = t.columns || t.fields || []; -%>
<% let pkCols = []; -%>
<% const pkIndex = t.indexes ? t.indexes.find(idx => idx.pk || idx.type === 'primary') : null; -%>
<% if (pkIndex) { -%>
<%   const rawPkCols = pkIndex.columns || pkIndex.fields || []; -%>
<%   pkCols = rawPkCols.map(c => typeof c === 'object' ? (c.value || c.name || '') : String(c)).filter(Boolean); -%>
<% } else { -%>
<%   pkCols = tableCols.filter(f => f.pk).map(f => f.name); -%>
<% } -%>
<% tableCols.forEach((field, index) => { -%>
<%   const rawDefVal = (field.dbdefault !== null && field.dbdefault !== undefined && field.dbdefault !== '') ? field.dbdefault : (field.default !== undefined ? field.default : ''); -%>
<%   const formattedDefVal = formatSqlDefault(rawDefVal, field.dataType || field.type); -%>
<%   const colComment = options.includeComment ? getCommentText(field, options.commentSource) : ''; -%>
  \`<%= field.name %>\` <%= field.type %><% if (formattedDefVal) { %> DEFAULT <%- formattedDefVal %><% } %><% if (field.not_null || field.notNull || field.pk) { %> NOT NULL<% } %><% if (colComment) { %> OPTIONS(description="<%- colComment %>")<% } %><% if (index < tableCols.length - 1 || pkCols.length > 0) { %>,<% } %>
<% }) -%>
<% if (pkCols.length > 0) { -%>
  PRIMARY KEY (<%- pkCols.map(c => '\`' + c + '\`').join(', ') %>) NOT ENFORCED
<% } -%>
)<%
  const partBy = (t.custom && t.custom.partition_by) ? t.custom.partition_by : '';
  const clusterBy = (t.custom && t.custom.cluster_by) ? t.custom.cluster_by : '';
  const tblComment = options.includeComment ? getCommentText(t, options.commentSource) : '';
-%><% if (partBy) { %>
PARTITION BY <%= partBy %><% } %><% if (clusterBy) { %>
CLUSTER BY <%= clusterBy %><% } %><% if (tblComment) { %>
OPTIONS(description="<%- tblComment %>")<% } %>;

<% }) -%>

<% if (typeof refs !== 'undefined' && Array.isArray(refs) && refs.length > 0) { -%>
-- ==========================================
-- FOREIGN KEY CONSTRAINTS (NOT ENFORCED)
-- ==========================================
<% const targetNamesSet = new Set(targetTables.map(t => t.name)); -%>
<% const tblDatasetMap = new Map(targetTables.map(t => [t.name, (t.custom && t.custom.dataset) ? t.custom.dataset : 'my_dataset'])); -%>
<% refs.forEach(ref => { -%>
<%   if (ref.endpoints && ref.endpoints.length === 2) { -%>
<%     const ep1 = ref.endpoints[0]; const ep2 = ref.endpoints[1]; -%>
<%     let childEp = ep1; let parentEp = ep2; -%>
<%     if (ep2.relation === '*' || ep1.relation === '1') { childEp = ep2; parentEp = ep1; } -%>
<%     if (targetNamesSet.has(childEp.tableName)) { -%>
<%       const cDs = tblDatasetMap.get(childEp.tableName) || 'my_dataset'; -%>
<%       const pDs = tblDatasetMap.get(parentEp.tableName) || 'my_dataset'; -%>
<%       const cCols = (childEp.fieldNames || []).map(f => '\`' + f + '\`').join(', '); -%>
<%       const pCols = (parentEp.fieldNames || []).map(f => '\`' + f + '\`').join(', '); -%>
<%       const fkName = ref.name || ('FK_' + childEp.tableName + '_' + (childEp.fieldNames || []).join('_')); -%>
ALTER TABLE \`<%= cDs %>.<%= childEp.tableName %>\` ADD CONSTRAINT \`<%= fkName %>\` FOREIGN KEY (<%- cCols %>) REFERENCES \`<%= pDs %>.<%= parentEp.tableName %>\` (<%- pCols %>) NOT ENFORCED;
<%     } -%>
<%   } -%>
<% }) -%>
<% } -%>
`;
