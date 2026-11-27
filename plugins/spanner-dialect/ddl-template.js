// 日本語コメント: Google Cloud Spanner DDL エクスポート EJS テンプレート文字列 (plugins/spanner-dialect/ddl-template.js)

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
  if (/^(current_timestamp|current_date|generate_uuid\\(\\))/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
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
  return txt.trim();
}
-%>
<% if (options.includeDelete && (options.deletePosition === 'top' || !options.deletePosition)) { -%>
-- ==========================================
-- DROP TABLE STATEMENTS
-- ==========================================
<% targetTables.forEach(t => { -%>
DROP TABLE \`<%= t.name %>\`;
<% }) -%>

<% } -%>
<% targetTables.forEach(t => { -%>
<% if (options.includeDelete && options.deletePosition === 'inline') { -%>
DROP TABLE \`<%= t.name %>\`;
<% } -%>

-- <%= t.name %><%- t.logicalName ? ' (' + t.logicalName + ')' : '' %>
<% if (options.includeComment) { const tc = getCommentText(t, options.commentSource); if (tc) { -%>
-- <%= tc %>
<% } } -%>
CREATE TABLE \`<%= t.name %>\` (
<% const tableCols = t.columns || t.fields || []; -%>
<% tableCols.forEach((field, index) => { -%>
<%   const rawDefVal = (field.dbdefault !== null && field.dbdefault !== undefined && field.dbdefault !== '') ? field.dbdefault : (field.default !== undefined ? field.default : ''); -%>
<%   const formattedDefVal = formatSqlDefault(rawDefVal, field.dataType || field.type); -%>
<%   const cc = options.includeComment ? getCommentText(field, options.commentSource) : ''; -%>
  \`<%= field.name %>\` <%= field.type %><% if (field.not_null || field.notNull || field.pk) { %> NOT NULL<% } %><% if (formattedDefVal) { %> DEFAULT (<%- formattedDefVal %>)<% } %><% if (index < tableCols.length - 1) { %>,<% } %><% if (cc) { %> -- <%= cc %><% } %>
<% }) -%>
<%
  let pkCols = [];
  const pkIndex = t.indexes ? t.indexes.find(idx => idx.pk || idx.type === 'primary') : null;
  if (pkIndex) {
    const rawPkCols = pkIndex.columns || pkIndex.fields || [];
    pkCols = rawPkCols.map(c => typeof c === 'object' ? (c.value || c.name || '') : String(c)).filter(Boolean);
  } else {
    pkCols = tableCols.filter(f => f.pk).map(f => f.name);
  }
  const interleave = (t.custom && t.custom.interleave_in_parent) ? t.custom.interleave_in_parent : '';
  const onDel = (t.custom && t.custom.on_delete_action) ? t.custom.on_delete_action : '';
  const ttl = (t.custom && t.custom.row_deletion_policy) ? t.custom.row_deletion_policy : '';
-%>
)<% if (pkCols.length > 0) { %> PRIMARY KEY (<%- pkCols.map(c => '\`' + c + '\`').join(', ') %>)<% } %><% if (interleave) { %>,
  INTERLEAVE IN PARENT \`<%= interleave %>\`<% if (onDel) { %> ON DELETE <%= onDel %><% } %><% } %><% if (ttl) { %>,
  ROW DELETION POLICY (<%= ttl %>)<% } %>;

<% if (t.indexes) { -%>
<% t.indexes.forEach(idx => { -%>
<% if (!idx.pk && idx.type !== 'primary') { -%>
<%   const idxRawCols = idx.columns || idx.fields || []; -%>
<%   const idxColsList = idxRawCols.map(c => {
       const str = typeof c === 'object' ? (c.value || c.name || c.expression || '') : String(c);
       return '\`' + str.replace(/[\`"]/g, '') + '\`';
     }).filter(Boolean); -%>
<%   if (idxColsList.length > 0) { -%>
<%     const idxName = idx.name || ('IDX_' + t.name + '_' + idxColsList.map(c => c.replace(/\`/g, '')).join('_')); -%>
CREATE <% if (idx.unique) { %>UNIQUE <% } %>INDEX \`<%= idxName %>\` ON \`<%= t.name %>\` (<%- idxColsList.join(', ') %>);
<%   } -%>
<% } -%>
<% }) -%>
<% } -%>
<% }) -%>

<% if (typeof refs !== 'undefined' && Array.isArray(refs) && refs.length > 0) { -%>
-- ==========================================
-- FOREIGN KEY CONSTRAINTS
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
