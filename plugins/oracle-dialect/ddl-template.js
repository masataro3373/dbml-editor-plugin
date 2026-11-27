// 日本語コメント: Oracle DDL エクスポート EJS テンプレート文字列 (plugins/oracle-dialect/ddl-template.js)
// Vite 等の ?raw ローダーに依存せず、ブラウザ内動的ローダーで安全に実行できるように文字列定数としてエクスポートします。

export const ddlExportTemplate = `<% const targetTables = typeof tables !== 'undefined' && Array.isArray(tables) ? tables : (typeof table !== 'undefined' ? [table] : []); -%>
<%
function formatSqlDefault(val, dataType) {
  if (val === undefined || val === null || String(val).trim() === '') return '';
  const strVal = String(val).trim();
  if (strVal.startsWith("'") && strVal.endsWith("'")) {
    return strVal;
  }
  const typeStr = typeof dataType === 'string' ? dataType : (dataType ? (dataType.type_name || '') : '');
  const isStringType = /^(VARCHAR|VARCHAR2|CHAR|NVARCHAR|NVARCHAR2|TEXT|CLOB|STRING)/i.test(typeStr.trim());
  if (isStringType) {
    return "'" + strVal.replace(/'/g, "''") + "'";
  }
  if (!isNaN(Number(strVal))) {
    return strVal;
  }
  const isFunctionOrKeyword = /^(sysdate|current_timestamp|now\\(\\)|null|true|false|sequence\\.nextval)/i.test(strVal) || strVal.endsWith(')') || strVal.startsWith('(');
  if (isFunctionOrKeyword) {
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
<% targetTables.forEach(t => { -%>
DROP TABLE "<%= t.name %>" CASCADE CONSTRAINTS;
<% }) -%>

<% } -%>
<% targetTables.forEach(t => { -%>
<% if (options.includeDelete && options.deletePosition === 'inline') { -%>
DROP TABLE "<%= t.name %>" CASCADE CONSTRAINTS;
<% } -%>

-- <%= t.name %><%- t.logicalName ? ' (' + t.logicalName + ')' : '' %>
<% /* 日本語コメント: 一時テーブル（GLOBAL TEMPORARY / PRIVATE TEMPORARY）判定フラグ */ -%>
<% const isTemp = Boolean(t.custom && t.custom.table_type); -%>
<% const tableTypeKw = (t.custom && t.custom.table_type) ? (t.custom.table_type + ' ') : ''; -%>
CREATE <%= tableTypeKw %>TABLE "<%= t.name %>" (
<% const tableCols = t.columns || t.fields || []; -%>
<% tableCols.forEach((field, index) => { -%>
<%   const rawDefVal = (field.dbdefault !== null && field.dbdefault !== undefined && field.dbdefault !== '') ? field.dbdefault : (field.default !== undefined ? field.default : ''); -%>
<%   const formattedDefVal = formatSqlDefault(rawDefVal, field.dataType || field.type); -%>
  "<%= field.name %>" <%= field.type %><% if (formattedDefVal) { %> DEFAULT <%- formattedDefVal %><% } %><% if (field.not_null || field.notNull || field.pk) { %> NOT NULL<% } %><% if (index < tableCols.length - 1 || (t.indexes && t.indexes.some(idx => idx.pk || idx.type === 'primary')) || (t.fields && t.fields.some(f => f.pk))) { %>,<% } %>
<% }) -%>
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
<% if (pkCols.length > 0) { -%>
<%   /* 日本語コメント: 表領域オプションが有効、かつ一時テーブルでなく、インデックス表領域が指定されている場合のみUSING INDEX TABLESPACEを出力 */ -%>
<%   const idxTablespace = (options.includeTablespace !== false && !isTemp && t.custom && t.custom.index_tablespace) ? t.custom.index_tablespace : ''; -%>
  CONSTRAINT "<%= pkName %>" PRIMARY KEY (<%- pkCols.map(c => '"' + c + '"').join(', ') %>)<% if (idxTablespace) { %> USING INDEX TABLESPACE "<%= idxTablespace %>"<% } %>
<% } -%>
)
<% /* 日本語コメント: 一時テーブルの場合はON COMMIT句のみを出力し、物理属性(PCTFREE/INITRANS/TABLESPACE/LOGGING)は出力しない */ -%>
<% if (isTemp) { -%>
ON COMMIT <%= (t.custom && t.custom.on_commit) ? t.custom.on_commit : 'DELETE ROWS' %>
<% } else { -%>
<%   /* 日本語コメント: 通常テーブルの場合の物理属性（PCTFREE, INITRANS, TABLESPACE, LOGGING, LOB句） */ -%>
<%   /* 日本語コメント: PCTFREE/INITRANS出力オプションが有効な場合のみPCTFREE/INITRANSを出力 */ -%>
<%   if (options.includePctfreeInitrans !== false) { -%>
<%     if (t.custom && t.custom.pctfree !== undefined && t.custom.pctfree !== null && String(t.custom.pctfree).trim() !== '') { -%>
PCTFREE <%= t.custom.pctfree %>
<%     } -%>
<%     if (t.custom && t.custom.initrans !== undefined && t.custom.initrans !== null && String(t.custom.initrans).trim() !== '') { -%>
INITRANS <%= t.custom.initrans %>
<%     } -%>
<%   } -%>
<%   /* 日本語コメント: 表領域オプションが有効な場合のみTABLESPACE句を出力 */ -%>
<%   if (options.includeTablespace !== false && t.custom && t.custom.tablespace) { -%>
TABLESPACE "<%= t.custom.tablespace %>"
<%   } -%>
<%   if (t.custom && t.custom.logging !== undefined && t.custom.logging !== null) { -%>
<%     if (typeof t.custom.logging === 'boolean') { -%>
<%= t.custom.logging ? 'LOGGING' : 'NOLOGGING' %>
<%     } else if (String(t.custom.logging).trim() !== '') { -%>
<%= String(t.custom.logging).toUpperCase() %>
<%     } -%>
<%   } -%>
<%   const lobFields = tableCols.filter(f => {
       const typeStr = (f.type || f.dataType || '').toString().trim();
       return /^(CLOB|BLOB|NCLOB|BFILE)/i.test(typeStr);
     }); -%>
<%   /* 日本語コメント: 表領域オプションが有効な場合のみLOBのTABLESPACE句を出力 */ -%>
<%   const lobTablespace = (options.includeTablespace !== false && t.custom && t.custom.lob_tablespace) ? t.custom.lob_tablespace : ''; -%>
<%   if (lobFields.length > 0 && lobTablespace) { -%>
LOB (<%- lobFields.map(f => '"' + f.name + '"').join(', ') %>) STORE AS (TABLESPACE "<%= lobTablespace %>")
<%   } -%>
<% } -%>
;

<% if (t.indexes) { -%>
<% t.indexes.forEach(idx => { -%>
<% if (!idx.pk && idx.type !== 'primary') { -%>
<%   const idxRawCols = idx.columns || idx.fields || []; -%>
<%   const idxColsList = idxRawCols.map(c => {
       const str = typeof c === 'object' ? (c.value || c.name || c.expression || '') : String(c);
       // 日本語コメント: バッククォートで囲まれたインデックス式の場合は外側のバッククォートを除去
       if (str.startsWith('\`') && str.endsWith('\`')) return str.slice(1, -1);
       if (str.includes('(') || str.includes(' ')) return str;
       return '"' + str + '"';
     }).filter(Boolean); -%>
<%   if (idxColsList.length > 0) { -%>
<%     const autoIdxName = ('IDX_' + t.name.toUpperCase() + '_' + idxColsList.join('_').replace(/[^a-zA-Z0-9_]+/g, '_').toUpperCase()).substring(0, 30); -%>
CREATE <% if (idx.unique) { %>UNIQUE <% } %>INDEX "<%= idx.name || autoIdxName %>" 
  ON "<%= t.name %>" (<%- idxColsList.join(', ') %>)
<%     /* 日本語コメント: 表領域オプションが有効、かつ一時テーブルでなく、インデックス表領域が指定されている場合のみTABLESPACE句を出力 */ -%>
<%     if (options.includeTablespace !== false && !isTemp && t.custom && t.custom.index_tablespace) { -%>
  TABLESPACE "<%= t.custom.index_tablespace %>"
<%     } -%>
;
<%   } -%>
<% } -%>
<% }) -%>
<% } -%>

<% if (t.checks && Array.isArray(t.checks) && t.checks.length > 0) { -%>
<% t.checks.forEach(chk => { -%>
<%   if (chk.expression) { -%>
<%     const chkName = chk.name || ('CHK_' + t.name.toUpperCase() + '_' + Date.now().toString().slice(-4)); -%>
<%     /* 日本語コメント: CHECK制約式の前後のトリムおよび余分なクォート記号（シングル/ダブル/バッククォート）を除去して出力 */ -%>
ALTER TABLE "<%= t.name %>" ADD CONSTRAINT "<%= chkName %>" CHECK (<%- chk.expression.trim().replace(/^['"\`]|['"\`]$/g, '') %>);
<%   } -%>
<% }) -%>
<% } -%>

<% if (options.includeComment && options.commentPosition === 'inline') { -%>
<%   const tblComment = getCommentText(t, options.commentSource); -%>
<%   if (tblComment) { -%>
COMMENT ON TABLE "<%= t.name %>" IS '<%- tblComment %>';
<%   } -%>
<%   tableCols.forEach(field => { -%>
<%     const colComment = getCommentText(field, options.commentSource); -%>
<%     if (colComment) { -%>
COMMENT ON COLUMN "<%= t.name %>"."<%= field.name %>" IS '<%- colComment %>';
<%     } -%>
<%   }) -%>

<% } -%>
<% }) -%>
<% if (options.includeComment && (options.commentPosition === 'bottom' || !options.commentPosition)) { -%>
-- ==========================================
-- COMMENTS
-- ==========================================
<% targetTables.forEach(t => { -%>
<%   const tableCols = t.columns || t.fields || []; -%>
<%   const tblComment = getCommentText(t, options.commentSource); -%>
<%   if (tblComment) { -%>
COMMENT ON TABLE "<%= t.name %>" IS '<%- tblComment %>';
<%   } -%>
<%   tableCols.forEach(field => { -%>
<%     const colComment = getCommentText(field, options.commentSource); -%>
<%     if (colComment) { -%>
COMMENT ON COLUMN "<%= t.name %>"."<%= field.name %>" IS '<%- colComment %>';
<%     } -%>
<%   }) -%>
<% }) -%>

<% } -%>
<% const allRefs = typeof refs !== 'undefined' && Array.isArray(refs) ? refs : []; -%>
<% const targetTableNamesUpper = new Set(targetTables.map(t => t.name.toUpperCase())); -%>
<% const validRefs = allRefs.filter(r => {
     if (!r || !r.endpoints || r.endpoints.length < 2) return false;
     const ep1 = r.endpoints[0];
     const ep2 = r.endpoints[1];
     if (!ep1 || !ep2 || !ep1.tableName || !ep2.tableName) return false;
     return targetTableNamesUpper.has(ep1.tableName.toUpperCase()) && targetTableNamesUpper.has(ep2.tableName.toUpperCase());
   }); -%>
<% if (validRefs.length > 0) { -%>
-- ==========================================
-- FOREIGN KEY CONSTRAINTS
-- ==========================================
<% validRefs.forEach(r => { -%>
<%   const ep1 = r.endpoints[0]; -%>
<%   const ep2 = r.endpoints[1]; -%>
<%   const ep1Cols = Array.isArray(ep1.fieldNames) ? ep1.fieldNames.map(c => '"' + c + '"').join(', ') : ('"' + ep1.fieldNames + '"'); -%>
<%   const ep2Cols = Array.isArray(ep2.fieldNames) ? ep2.fieldNames.map(c => '"' + c + '"').join(', ') : ('"' + ep2.fieldNames + '"'); -%>
<%   const fkName = r.name ? r.name : ('FK_' + ep1.tableName + '_' + (ep1.fieldNames[0] || 'REF')); -%>
<%   const delAct = formatFkAction(r.onDelete); -%>
ALTER TABLE "<%= ep1.tableName %>" ADD CONSTRAINT "<%= fkName %>" FOREIGN KEY (<%- ep1Cols %>) REFERENCES "<%= ep2.tableName %>" (<%- ep2Cols %>)<% if (delAct && (delAct === 'CASCADE' || delAct === 'SET NULL')) { %> ON DELETE <%= delAct %><% } %>;
<% }) -%>
<% } -%>
`;
