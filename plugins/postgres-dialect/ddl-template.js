// 日本語コメント: PostgreSQL DDL エクスポート EJS テンプレート文字列 (plugins/postgres-dialect/ddl-template.js)

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
  const isStringType = /^(VARCHAR|CHAR|TEXT|UUID|CHARACTER)/i.test(typeStr.trim());
  if (isStringType) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  const lower = strVal.toLowerCase();
  if (['true', 'false', 'null'].includes(lower)) {
    return lower.toUpperCase();
  }
  if (/^(now\\(\\)|current_timestamp|current_date|gen_random_uuid\\(\\))/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
    return strVal;
  }
  if (!isNaN(Number(strVal))) {
    return strVal;
  }
  return "'" + strVal.replace(/'/g, "''") + "'";
}

function resolvePgType(field) {
  let t = (field.type || field.dataType || 'VARCHAR(255)').toString().trim();
  if (field.increment) {
    if (/^(BIGINT|INT8)/i.test(t)) return 'BIGSERIAL';
    if (!/^(SERIAL|BIGSERIAL|SMALLSERIAL)/i.test(t)) return 'SERIAL';
  }
  return t;
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
DROP TABLE IF EXISTS <%- getQualifiedTableName(t) %> CASCADE;
<% }) -%>

<% } -%>
<% targetTables.forEach(t => { -%>
<% const qTableName = getQualifiedTableName(t); -%>
<% if (options.includeDelete && options.deletePosition === 'inline') { -%>
DROP TABLE IF EXISTS <%- qTableName %> CASCADE;
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
<%   const pgType = resolvePgType(field); -%>
<%   const isSerial = /^(SERIAL|BIGSERIAL|SMALLSERIAL)$/i.test(pgType); -%>
<%   const rawDefVal = !isSerial ? ((field.dbdefault !== null && field.dbdefault !== undefined && field.dbdefault !== '') ? field.dbdefault : (field.default !== undefined ? field.default : '')) : ''; -%>
<%   const formattedDefVal = formatSqlDefault(rawDefVal, pgType); -%>
  "<%= field.name %>" <%= pgType %><% if (formattedDefVal) { %> DEFAULT <%- formattedDefVal %><% } %><% if (field.not_null || field.notNull || field.pk) { %> NOT NULL<% } %><% if (index < tableCols.length - 1 || pkCols.length > 0) { %>,<% } %>
<% }) -%>
<% if (pkCols.length > 0) { -%>
  CONSTRAINT "<%= pkName %>" PRIMARY KEY (<%- pkCols.map(c => '"' + c + '"').join(', ') %>)
<% } -%>
)<% if (options.includeTablespace !== false && t.custom && t.custom.tablespace) { %> TABLESPACE "<%= t.custom.tablespace %>"<% } %>;

<% if (t.indexes) { -%>
<% t.indexes.forEach(idx => { -%>
<% if (!idx.pk && idx.type !== 'primary') { -%>
<%   const idxRawCols = idx.columns || idx.fields || []; -%>
<%   const idxColsList = idxRawCols.map(c => {
       const str = typeof c === 'object' ? (c.value || c.name || c.expression || '') : String(c);
       if (str.startsWith('\`') && str.endsWith('\`')) return str.slice(1, -1);
       if (str.includes('(') || str.includes(' ')) return str;
       return '"' + str + '"';
     }).filter(Boolean); -%>
<%   if (idxColsList.length > 0) { -%>
<%     const idxName = idx.name || ('IDX_' + t.name + '_' + idxColsList.map(c => c.replace(/"/g, '')).join('_')); -%>
<%     const idxTs = (options.includeTablespace !== false && t.custom && t.custom.index_tablespace) ? t.custom.index_tablespace : ''; -%>
CREATE <% if (idx.unique) { %>UNIQUE <% } %>INDEX "<%= idxName %>" ON <%- qTableName %> (<%- idxColsList.join(', ') %>)<% if (idxTs) { %> TABLESPACE "<%= idxTs %>"<% } %>;
<%   } -%>
<% } -%>
<% }) -%>
<% } -%>
<% if (options.includeComment && options.commentPosition === 'inline') { -%>
<%   const tComment = getCommentText(t, options.commentSource); -%>
<%   if (tComment) { -%>
COMMENT ON TABLE <%- qTableName %> IS '<%- tComment %>';
<%   } -%>
<%   tableCols.forEach(field => { -%>
<%     const cComment = getCommentText(field, options.commentSource); -%>
<%     if (cComment) { -%>
COMMENT ON COLUMN <%- qTableName %>."<%= field.name %>" IS '<%- cComment %>';
<%     } -%>
<%   }) -%>
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
<%       const cCols = (childEp.fieldNames || []).map(f => '"' + f + '"').join(', '); -%>
<%       const pCols = (parentEp.fieldNames || []).map(f => '"' + f + '"').join(', '); -%>
<%       const fkName = ref.name || ('FK_' + childEp.tableName + '_' + (childEp.fieldNames || []).join('_')); -%>
<%       const onDel = formatFkAction(ref.onDelete); const onUpd = formatFkAction(ref.onUpdate); -%>
ALTER TABLE "<%= childEp.tableName %>" ADD CONSTRAINT "<%= fkName %>" FOREIGN KEY (<%- cCols %>) REFERENCES "<%= parentEp.tableName %>" (<%- pCols %>)<% if (onDel) { %> ON DELETE <%= onDel %><% } %><% if (onUpd) { %> ON UPDATE <%= onUpd %><% } %>;
<%     } -%>
<%   } -%>
<% }) -%>
<% } -%>

<% if (options.includeComment && (options.commentPosition === 'bottom' || !options.commentPosition)) { -%>
-- ==========================================
-- COMMENTS
-- ==========================================
<% targetTables.forEach(t => { -%>
<%   const qTableName = getQualifiedTableName(t); -%>
<%   const tComment = getCommentText(t, options.commentSource); -%>
<%   if (tComment) { -%>
COMMENT ON TABLE <%- qTableName %> IS '<%- tComment %>';
<%   } -%>
<%   const tableCols = t.columns || t.fields || []; -%>
<%   tableCols.forEach(field => { -%>
<%     const cComment = getCommentText(field, options.commentSource); -%>
<%     if (cComment) { -%>
COMMENT ON COLUMN <%- qTableName %>."<%= field.name %>" IS '<%- cComment %>';
<%     } -%>
<%   }) -%>
<% }) -%>
<% } -%>
`;
