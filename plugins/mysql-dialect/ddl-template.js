// 日本語コメント: MySQL / MariaDB DDL エクスポート EJS テンプレート文字列 (plugins/mysql-dialect/ddl-template.js)

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
  const isStringType = /^(VARCHAR|CHAR|TEXT|MEDIUMTEXT|LONGTEXT|TINYTEXT)/i.test(typeStr.trim());
  if (isStringType) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  const lower = strVal.toLowerCase();
  if (['true', 'false', 'null'].includes(lower)) {
    return lower.toUpperCase();
  }
  if (/^(now\\(\\)|current_timestamp|current_date)/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
    return strVal;
  }
  if (!isNaN(Number(strVal))) {
    return strVal;
  }
  return "'" + strVal.replace(/'/g, "''") + "'";
}

function formatFkAction(action) {
  if (!action) return '';
  const act = String(action).toUpperCase().trim();
  if (['CASCADE', 'RESTRICT', 'SET NULL', 'SET DEFAULT', 'NO ACTION'].includes(act)) {
    return act;
  }
  return '';
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
  if (!txt) return '';
  return txt.replace(/'/g, "''");
}
-%>
<% if (options.includeDelete && (options.deletePosition === 'top' || !options.deletePosition)) { -%>
-- ==========================================
-- DROP TABLE STATEMENTS
-- ==========================================
SET FOREIGN_KEY_CHECKS = 0;
<% targetTables.forEach(t => { -%>
DROP TABLE IF EXISTS \`<%= t.name %>\`;
<% }) -%>
SET FOREIGN_KEY_CHECKS = 1;

<% } -%>
<% targetTables.forEach(t => { -%>
<% if (options.includeDelete && options.deletePosition === 'inline') { -%>
DROP TABLE IF EXISTS \`<%= t.name %>\`;
<% } -%>

-- <%= t.name %><%- t.logicalName ? ' (' + t.logicalName + ')' : '' %>
CREATE TABLE \`<%= t.name %>\` (
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
  \`<%= field.name %>\` <%= field.type %><% if (field.not_null || field.notNull || field.pk) { %> NOT NULL<% } %><% if (field.increment) { %> AUTO_INCREMENT<% } %><% if (formattedDefVal) { %> DEFAULT <%- formattedDefVal %><% } %><% if (colComment) { %> COMMENT '<%- colComment %>'<% } %><% if (index < tableCols.length - 1 || pkCols.length > 0) { %>,<% } %>
<% }) -%>
<% if (pkCols.length > 0) { -%>
  PRIMARY KEY (<%- pkCols.map(c => '\`' + c + '\`').join(', ') %>)
<% } -%>
)<%
  const engine = (t.custom && t.custom.engine) ? t.custom.engine : 'InnoDB';
  const charset = (t.custom && t.custom.charset) ? t.custom.charset : 'utf8mb4';
  const collate = (t.custom && t.custom.collate) ? t.custom.collate : '';
  const tblComment = options.includeComment ? getCommentText(t, options.commentSource) : '';
-%> ENGINE=<%= engine %> DEFAULT CHARSET=<%= charset %><% if (collate) { %> COLLATE=<%= collate %><% } %><% if (tblComment) { %> COMMENT='<%- tblComment %>'<% } %>;

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
<%       const onDel = formatFkAction(ref.onDelete); const onUpd = formatFkAction(ref.onUpdate); -%>
ALTER TABLE \`<%= childEp.tableName %>\` ADD CONSTRAINT \`<%= fkName %>\` FOREIGN KEY (<%- cCols %>) REFERENCES \`<%= parentEp.tableName %>\` (<%- pCols %>)<% if (onDel) { %> ON DELETE <%= onDel %><% } %><% if (onUpd) { %> ON UPDATE <%= onUpd %><% } %>;
<%     } -%>
<%   } -%>
<% }) -%>
<% } -%>
`;
