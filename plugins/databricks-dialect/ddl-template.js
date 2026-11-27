// 日本語コメント: Databricks SQL / Delta Lake DDL エクスポート EJS テンプレート文字列 (plugins/databricks-dialect/ddl-template.js)

export const ddlExportTemplate = `<% const targetTables = typeof tables !== 'undefined' && Array.isArray(tables) ? tables : (typeof table !== 'undefined' ? [table] : []); -%>
<%
function formatSqlDefault(val, dataType) {
  if (val === undefined || val === null) return '';
  const raw = (typeof val === 'object' && val !== null && 'value' in val) ? val.value : val;
  if (raw === undefined || raw === null || String(raw).trim() === '') return '';
  const strVal = String(raw).trim();
  if (strVal.startsWith("'") && strVal.endsWith("'")) return strVal;
  const typeStr = typeof dataType === 'string' ? dataType : (dataType ? (dataType.type_name || '') : '');
  if (/^(STRING|VARCHAR|CHAR)/i.test(typeStr.trim())) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  const lower = strVal.toLowerCase();
  if (['true', 'false', 'null'].includes(lower)) return lower.toUpperCase();
  if (/^(current_timestamp\\(\\)|current_date\\(\\)|uuid\\(\\))/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
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
  if (txt.includes('<!-- custom -->')) txt = txt.split('<!-- custom -->')[0].trim();
  txt = txt.trim();
  return txt ? txt.replace(/'/g, "''") : '';
}

function getQualifiedTableName(tbl) {
  const c = tbl.custom || {};
  const parts = [];
  if (c.catalog) parts.push('\`' + String(c.catalog).trim() + '\`');
  if (c.schema) parts.push('\`' + String(c.schema).trim() + '\`');
  parts.push('\`' + tbl.name + '\`');
  return parts.join('.');
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
CREATE TABLE IF NOT EXISTS <%- qTableName %> (
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
  \`<%= field.name %>\` <%= field.type %><% if (field.not_null || field.notNull || field.pk) { %> NOT NULL<% } %><% if (field.increment) { %> GENERATED ALWAYS AS IDENTITY<% } %><% if (formattedDefVal) { %> DEFAULT <%- formattedDefVal %><% } %><% if (colComment) { %> COMMENT '<%- colComment %>'<% } %><% if (index < tableCols.length - 1 || pkCols.length > 0) { %>,<% } %>
<% }) -%>
<% if (pkCols.length > 0) { -%>
  CONSTRAINT \`<%= pkName %>\` PRIMARY KEY (<%- pkCols.map(c => '\`' + c + '\`').join(', ') %>)
<% } -%>
)<%
  const usingFmt = (t.custom && t.custom.using) ? t.custom.using : 'DELTA';
  const partBy = (t.custom && t.custom.partitioned_by) ? t.custom.partitioned_by : '';
  const loc = (t.custom && t.custom.location) ? t.custom.location : '';
  const tblComment = options.includeComment ? getCommentText(t, options.commentSource) : '';
-%>
USING <%= usingFmt %><% if (partBy) { %>
PARTITIONED BY (<%= partBy %>)<% } %><% if (loc) { %>
LOCATION '<%= loc %>'<% } %><% if (tblComment) { %>
COMMENT '<%- tblComment %>'<% } %>;

<% }) -%>

<% if (typeof refs !== 'undefined' && Array.isArray(refs) && refs.length > 0) { -%>
-- ==========================================
-- FOREIGN KEY CONSTRAINTS (Unity Catalog)
-- ==========================================
<% const targetNamesSet = new Set(targetTables.map(t => t.name)); -%>
<% refs.forEach(ref => { -%>
<%   if (ref.endpoints && ref.endpoints.length === 2) { -%>
<%     const ep1 = ref.endpoints[0]; const ep2 = ref.endpoints[1]; -%>
<%     let childEp = ep1; let parentEp = ep2; -%>
<%     if (ep2.relation === '*' || ep1.relation === '1') { childEp = ep2; parentEp = ep1; } -%>
<%     if (targetNamesSet.has(childEp.tableName)) { -%>
<%       const cCols = (childEp.fieldNames || []).map(f => '\`' + f + '\`').join(', '); -%>
<%       const pCols = (parentEp.fieldNames || []).map(f => '\`' + f + '\`').join(', '); -%>
<%       const fkName = ref.name || ('FK_' + childEp.tableName + '_' + (childEp.fieldNames || []).join('_')); -%>
ALTER TABLE \`<%= childEp.tableName %>\` ADD CONSTRAINT \`<%= fkName %>\` FOREIGN KEY (<%- cCols %>) REFERENCES \`<%= parentEp.tableName %>\` (<%- pCols %>);
<%     } -%>
<%   } -%>
<% }) -%>
<% } -%>
`;
