// 日本語コメント: SQL Server / MS-SQL DDL エクスポート EJS テンプレート文字列 (plugins/mssql-dialect/ddl-template.js)

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
  const isUnicodeStr = /^(NVARCHAR|NCHAR|NTEXT)/i.test(typeStr.trim());
  const isStringType = /^(VARCHAR|CHAR|TEXT|UNIQUEIDENTIFIER)/i.test(typeStr.trim());
  if (isUnicodeStr) {
    return "N'" + strVal.replace(/'/g, "''") + "'";
  }
  if (isStringType) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  const lower = strVal.toLowerCase();
  if (['null'].includes(lower)) return 'NULL';
  if (lower === 'true') return '1';
  if (lower === 'false') return '0';
  if (/^(getdate\\(\\)|sysdatetime\\(\\)|newid\\(\\)|current_timestamp)/i.test(lower) || strVal.endsWith(')') || strVal.startsWith('(')) {
    return strVal;
  }
  if (!isNaN(Number(strVal))) {
    return strVal;
  }
  return "N'" + strVal.replace(/'/g, "''") + "'";
}

function formatFkAction(action) {
  if (!action) return '';
  const act = String(action).toUpperCase().trim();
  if (['CASCADE', 'SET NULL', 'SET DEFAULT', 'NO ACTION'].includes(act)) {
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

function getSchemaName(tbl) {
  return (tbl.custom && tbl.custom.schema) ? String(tbl.custom.schema).trim() : 'dbo';
}
-%>
<% if (options.includeDelete && (options.deletePosition === 'top' || !options.deletePosition)) { -%>
-- ==========================================
-- DROP TABLE STATEMENTS
-- ==========================================
<% targetTables.forEach(t => { -%>
<% const sch = getSchemaName(t); -%>
DROP TABLE IF EXISTS [<%= sch %>].[<%= t.name %>];
<% }) -%>
GO

<% } -%>
<% targetTables.forEach(t => { -%>
<% const sch = getSchemaName(t); -%>
<% if (options.includeDelete && options.deletePosition === 'inline') { -%>
DROP TABLE IF EXISTS [<%= sch %>].[<%= t.name %>];
GO
<% } -%>

-- <%= t.name %><%- t.logicalName ? ' (' + t.logicalName + ')' : '' %>
CREATE TABLE [<%= sch %>].[<%= t.name %>] (
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
  [<%= field.name %>] <%= field.type %><% if (field.increment) { %> IDENTITY(1,1)<% } %><% if (formattedDefVal) { %> DEFAULT <%- formattedDefVal %><% } %><% if (field.not_null || field.notNull || field.pk) { %> NOT NULL<% } %><% if (index < tableCols.length - 1 || pkCols.length > 0) { %>,<% } %>
<% }) -%>
<% if (pkCols.length > 0) { -%>
  CONSTRAINT [<%= pkName %>] PRIMARY KEY CLUSTERED (<%- pkCols.map(c => '[' + c + ']').join(', ') %>)
<% } -%>
)<% if (t.custom && t.custom.filegroup) { %> ON [<%= t.custom.filegroup %>]<% } %>;
GO

<% if (t.indexes) { -%>
<% t.indexes.forEach(idx => { -%>
<% if (!idx.pk && idx.type !== 'primary') { -%>
<%   const idxRawCols = idx.columns || idx.fields || []; -%>
<%   const idxColsList = idxRawCols.map(c => {
       const str = typeof c === 'object' ? (c.value || c.name || c.expression || '') : String(c);
       return '[' + str.replace(/[\\[\\]\`"]/g, '') + ']';
     }).filter(Boolean); -%>
<%   if (idxColsList.length > 0) { -%>
<%     const idxName = idx.name || ('IDX_' + t.name + '_' + idxColsList.map(c => c.replace(/[\\[\\]]/g, '')).join('_')); -%>
CREATE <% if (idx.unique) { %>UNIQUE <% } %>NONCLUSTERED INDEX [<%= idxName %>] ON [<%= sch %>].[<%= t.name %>] (<%- idxColsList.join(', ') %>);
GO
<%   } -%>
<% } -%>
<% }) -%>
<% } -%>
<% if (options.includeComment && options.commentPosition === 'inline') { -%>
<%   const tComment = getCommentText(t, options.commentSource); -%>
<%   if (tComment) { -%>
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'<%- tComment %>', @level0type=N'SCHEMA', @level0name=N'<%= sch %>', @level1type=N'TABLE', @level1name=N'<%= t.name %>';
<%   } -%>
<%   tableCols.forEach(field => { -%>
<%     const cComment = getCommentText(field, options.commentSource); -%>
<%     if (cComment) { -%>
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'<%- cComment %>', @level0type=N'SCHEMA', @level0name=N'<%= sch %>', @level1type=N'TABLE', @level1name=N'<%= t.name %>', @level2type=N'COLUMN', @level2name=N'<%= field.name %>';
<%     } -%>
<%   }) -%>
GO
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
<%       const cCols = (childEp.fieldNames || []).map(f => '[' + f + ']').join(', '); -%>
<%       const pCols = (parentEp.fieldNames || []).map(f => '[' + f + ']').join(', '); -%>
<%       const fkName = ref.name || ('FK_' + childEp.tableName + '_' + (childEp.fieldNames || []).join('_')); -%>
<%       const onDel = formatFkAction(ref.onDelete); const onUpd = formatFkAction(ref.onUpdate); -%>
ALTER TABLE [dbo].[<%= childEp.tableName %>] ADD CONSTRAINT [<%= fkName %>] FOREIGN KEY (<%- cCols %>) REFERENCES [dbo].[<%= parentEp.tableName %>] (<%- pCols %>)<% if (onDel) { %> ON DELETE <%= onDel %><% } %><% if (onUpd) { %> ON UPDATE <%= onUpd %><% } %>;
<%     } -%>
<%   } -%>
<% }) -%>
GO
<% } -%>

<% if (options.includeComment && (options.commentPosition === 'bottom' || !options.commentPosition)) { -%>
-- ==========================================
-- EXTENDED PROPERTIES (COMMENTS)
-- ==========================================
<% targetTables.forEach(t => { -%>
<%   const sch = getSchemaName(t); -%>
<%   const tComment = getCommentText(t, options.commentSource); -%>
<%   if (tComment) { -%>
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'<%- tComment %>', @level0type=N'SCHEMA', @level0name=N'<%= sch %>', @level1type=N'TABLE', @level1name=N'<%= t.name %>';
<%   } -%>
<%   const tableCols = t.columns || t.fields || []; -%>
<%   tableCols.forEach(field => { -%>
<%     const cComment = getCommentText(field, options.commentSource); -%>
<%     if (cComment) { -%>
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'<%- cComment %>', @level0type=N'SCHEMA', @level0name=N'<%= sch %>', @level1type=N'TABLE', @level1name=N'<%= t.name %>', @level2type=N'COLUMN', @level2name=N'<%= field.name %>';
<%     } -%>
<%   }) -%>
<% }) -%>
GO
<% } -%>
`;
