// 日本語コメント: ER/Studio 25列 Excel 設計書インポーター実装 (plugins/erstudio-excel/excel-importer.js)
// context.libs.xlsx を用いて Excel ブックをブラウザ内で解析し、
// テーブル一覧シート・エンティティ属性シート、論理名、表領域、FKリレーション、設計メタデータを高精度に DBML テキストへ変換します。

function escapeInlineString(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r\n|\r|\n/g, '\\n');
}

function escapeBlockString(str) {
  if (!str) return '';
  return String(str)
    .replace(/'''/g, "\\'\\'\\'")
    .replace(/\r\n|\r/g, '\n');
}

function formatMetadataValue(val) {
  if (typeof val === 'boolean' || typeof val === 'number') {
    return String(val);
  }
  const str = String(val ?? '');
  return `'${escapeInlineString(str)}'`;
}

/**
 * 「テーブル一覧」シートの行配列からテーブル物理名・論理名・備考・物理表領域属性を抽出
 * @param {Array<Array<any>>} rows - シートの行配列
 * @returns {Map<string, Object>} テーブル物理名(大文字) -> テーブルメタ情報
 */
export function parseTableListSheetRows(rows = []) {
  const tableListMap = new Map(); // tableNameUpper -> tableInfo

  let headerIndex = -1;
  const colMap = {
    entityPhysicalName: -1,
    entityLogicalName: -1,
    definition: -1,
    entityNote: -1,
    remarks: -1,
    tablespace: -1,
    indexTablespace: -1,
    lobTablespace: -1,
  };

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] || [];
    const textJoin = row.map((c) => String(c || '').trim()).join(' ');
    if (
      textJoin.includes('物理') ||
      textJoin.includes('論理') ||
      textJoin.includes('名称') ||
      textJoin.includes('テーブル') ||
      textJoin.includes('エンティティ') ||
      /table/i.test(textJoin)
    ) {
      headerIndex = i;
      row.forEach((cell, colIdx) => {
        const val = String(cell || '').trim();
        if (/テーブル名|エンティティ.*物理|テーブル.*物理|物理名|物理テーブル名|名称.*物理|物理/i.test(val)) {
          colMap.entityPhysicalName = colIdx;
        } else if (/エンティティ名|エンティティ.*論理|テーブル.*論理|論理名|論理テーブル名|^名称$/i.test(val)) {
          colMap.entityLogicalName = colIdx;
        } else if (/エンティティ定義|テーブル定義|定義/i.test(val)) {
          colMap.definition = colIdx;
        } else if (/エンティティノート|テーブルノート|ノート/i.test(val)) {
          colMap.entityNote = colIdx;
        } else if (/インデックス.*表領域|index.*tablespace/i.test(val)) {
          colMap.indexTablespace = colIdx;
        } else if (/LOB.*表領域|lob.*tablespace/i.test(val)) {
          colMap.lobTablespace = colIdx;
        } else if (/データ.*表領域|表領域|tablespace/i.test(val)) {
          colMap.tablespace = colIdx;
        } else if (/備考|コメント|remarks/i.test(val)) {
          colMap.remarks = colIdx;
        }
      });
      break;
    }
  }

  // デフォルト列インデックスフォールバック
  if (colMap.entityPhysicalName === -1) colMap.entityPhysicalName = 1;
  if (colMap.entityLogicalName === -1) colMap.entityLogicalName = 0;

  const startRow = headerIndex >= 0 ? headerIndex + 1 : 1;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i] || [];
    const tblPhys = String(row[colMap.entityPhysicalName] || '').trim();
    if (!tblPhys) continue;

    const tblLogic = colMap.entityLogicalName >= 0 ? String(row[colMap.entityLogicalName] || '').trim() : '';
    const def = colMap.definition >= 0 ? String(row[colMap.definition] || '').trim() : '';
    const note = colMap.entityNote >= 0 ? String(row[colMap.entityNote] || '').trim() : '';
    const remarks = colMap.remarks >= 0 ? String(row[colMap.remarks] || '').trim() : '';
    const ts = colMap.tablespace >= 0 ? String(row[colMap.tablespace] || '').trim() : '';
    const idxTs = colMap.indexTablespace >= 0 ? String(row[colMap.indexTablespace] || '').trim() : '';
    const lobTs = colMap.lobTablespace >= 0 ? String(row[colMap.lobTablespace] || '').trim() : '';

    tableListMap.set(tblPhys.toUpperCase(), {
      name: tblPhys,
      logicalName: tblLogic,
      definition: def,
      entityNote: note,
      remarks,
      tablespace: ts,
      index_tablespace: idxTs,
      lob_tablespace: lobTs,
    });
  }

  return tableListMap;
}

/**
 * 25列 ER/Studio Excel 設計書のシート行配列からテーブル・カラム構造および外部キー(Ref)を抽出
 * @param {Array<Array<any>>} rows - シートの行配列
 * @returns {Array<Object>} テーブル配列 (配列に .refs プロパティを付与)
 */
export function parseErStudioSheetRows(rows = []) {
  const tablesMap = new Map(); // tableNameUpper -> tableObj
  const refs = []; // 外部キー定義配列

  // ヘッダー行を検出
  let headerIndex = -1;
  // ヘッダー行が検出できなかった場合の標準フォールバックインデックス
  const fallbackColMap = {
    entityLogicalName: 0,
    entityPhysicalName: 1,
    entityDef: 2,
    entityNote: 3,
    entityRemarks: 4,
    attrLogicalName: 5,
    attrPhysicalName: 6,
    domainName: 7,
    attrDef: 8,
    attrNote: 9,
    dataType: 10,
    length: 11,
    scale: 12,
    pk: 13,
    fk: 14,
    notNull: 15,
    defaultValue: 16,
    defaultName: 17,
    lookupName: 18,
    ruleName: 19,
    checkRule: 20,
    attrRemarks: 21,
    parentTable: -1,
    parentColumn: -1,
  };

  // 検出用マップ (初期状態は未検出 -1)
  const colMap = {
    entityLogicalName: -1,
    entityPhysicalName: -1,
    entityDef: -1,
    entityNote: -1,
    entityRemarks: -1,
    attrLogicalName: -1,
    attrPhysicalName: -1,
    domainName: -1,
    attrDef: -1,
    attrNote: -1,
    dataType: -1,
    length: -1,
    scale: -1,
    pk: -1,
    fk: -1,
    notNull: -1,
    defaultValue: -1,
    defaultName: -1,
    lookupName: -1,
    ruleName: -1,
    checkRule: -1,
    attrRemarks: -1,
    parentTable: -1,
    parentColumn: -1,
  };

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] || [];
    const textJoin = row.map((c) => String(c || '').replace(/\s+/g, ' ').trim()).join(' ');
    if (
      textJoin.includes('物理名') ||
      textJoin.includes('論理名') ||
      textJoin.includes('エンティティ') ||
      textJoin.includes('Table') ||
      textJoin.includes('カラム') ||
      textJoin.includes('属性')
    ) {
      headerIndex = i;
      // ヘッダー列インデックスの動的解決 (改行や空白を除去して正規化照合)
      row.forEach((cell, colIdx) => {
        const val = String(cell || '').replace(/[\r\n\s]+/g, '').trim();
        if (!val) return;

        // 優先度順にシソーラスマッチング (誤一致防止のため複合語・参照系を先に判定)
        if (/参照属性|参照カラム|親カラム|親属性|外部キーカラム/i.test(val)) colMap.parentColumn = colIdx;
        else if (/参照エンティティ|参照テーブル|親テーブル|親エンティティ|外部キーテーブル/i.test(val)) colMap.parentTable = colIdx;
        else if (/参照値名|ルックアップ|参照値/i.test(val)) colMap.lookupName = colIdx;
        else if (/^エンティティ名$|^論理エンティティ名$|^テーブル名\(論理\)$|エンティティ.*論理|テーブル.*論理/i.test(val)) colMap.entityLogicalName = colIdx;
        else if (/^テーブル名$|^物理テーブル名$|^テーブル名\(物理\)$|エンティティ.*物理|テーブル.*物理/i.test(val)) colMap.entityPhysicalName = colIdx;
        else if (/エンティティ定義|テーブル定義/i.test(val)) colMap.entityDef = colIdx;
        else if (/エンティティノート/i.test(val)) colMap.entityNote = colIdx;
        else if (/^属性名$|^カラム名\(論理\)$|カラム.*論理|属性.*論理/i.test(val)) colMap.attrLogicalName = colIdx;
        else if (/^カラム名$|^カラム名\(物理\)$|カラム.*物理|属性.*物理|物理カラム名/i.test(val)) colMap.attrPhysicalName = colIdx;
        else if (/ドメイン/i.test(val)) colMap.domainName = colIdx;
        else if (/属性定義|カラム定義/i.test(val)) colMap.attrDef = colIdx;
        else if (/属性ノート|カラムノート|属性コメント|カラムコメント/i.test(val)) colMap.attrNote = colIdx;
        else if (/データ型|型/i.test(val)) colMap.dataType = colIdx;
        else if (/桁数|長さ|長/i.test(val)) colMap.length = colIdx;
        else if (/精度|小数|スケール/i.test(val)) colMap.scale = colIdx;
        else if (/^PK$|主キー/i.test(val)) colMap.pk = colIdx;
        else if (/^FK$|外部キー/i.test(val)) colMap.fk = colIdx;
        else if (/必須|NOT\s*NULL/i.test(val)) colMap.notNull = colIdx;
        else if (/デフォルト名/i.test(val)) colMap.defaultName = colIdx;
        else if (/デフォルト値|初期値|^デフォルト$/i.test(val)) colMap.defaultValue = colIdx;
        else if (/チェック制約|チェックルール|制約式|ルール.*チェック/i.test(val)) colMap.checkRule = colIdx;
        else if (/ルール名/i.test(val)) colMap.ruleName = colIdx;
        else if (/備考/i.test(val)) {
          if (colIdx > 15) colMap.attrRemarks = colIdx;
          else colMap.entityRemarks = colIdx;
        }
      });
      break;
    }
  }

  // ヘッダー行が見つからなかった場合は fallbackColMap を採用
  if (headerIndex === -1) {
    Object.assign(colMap, fallbackColMap);
  } else {
    // 必須列がヘッダーから検出できなかった場合のみフォールバック
    if (colMap.entityPhysicalName === -1) colMap.entityPhysicalName = fallbackColMap.entityPhysicalName;
    if (colMap.entityLogicalName === -1) colMap.entityLogicalName = fallbackColMap.entityLogicalName;
    if (colMap.attrPhysicalName === -1) colMap.attrPhysicalName = fallbackColMap.attrPhysicalName;
    if (colMap.attrLogicalName === -1) colMap.attrLogicalName = fallbackColMap.attrLogicalName;
    if (colMap.dataType === -1) colMap.dataType = fallbackColMap.dataType;
  }

  const startRow = headerIndex >= 0 ? headerIndex + 1 : 0;
  let currentTable = null;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i] || [];
    const tblPhys = colMap.entityPhysicalName >= 0 ? String(row[colMap.entityPhysicalName] || '').trim() : '';
    const tblLogic = colMap.entityLogicalName >= 0 ? String(row[colMap.entityLogicalName] || '').trim() : '';

    if (tblPhys) {
      const key = tblPhys.toUpperCase();
      if (!tablesMap.has(key)) {
        currentTable = {
          name: tblPhys,
          logicalName: tblLogic,
          definition: colMap.entityDef >= 0 ? String(row[colMap.entityDef] || '').trim() : '',
          entityNote: colMap.entityNote >= 0 ? String(row[colMap.entityNote] || '').trim() : '',
          remarks: colMap.entityRemarks >= 0 ? String(row[colMap.entityRemarks] || '').trim() : '',
          fields: [],
        };
        tablesMap.set(key, currentTable);
      } else {
        currentTable = tablesMap.get(key);
      }
    }

    if (!currentTable) continue;

    const colPhys = colMap.attrPhysicalName >= 0 ? String(row[colMap.attrPhysicalName] || '').trim() : '';
    if (!colPhys) continue;

    const colLogic = colMap.attrLogicalName >= 0 ? String(row[colMap.attrLogicalName] || '').trim() : '';
    const rawType = colMap.dataType >= 0 ? String(row[colMap.dataType] || 'VARCHAR2').trim() : 'VARCHAR2';
    const len = colMap.length >= 0 ? String(row[colMap.length] || '').trim() : '';
    const sc = colMap.scale >= 0 ? String(row[colMap.scale] || '').trim() : '';

    let fullType = rawType;
    if (len && sc) fullType = `${rawType}(${len},${sc})`;
    else if (len && !rawType.includes('(')) fullType = `${rawType}(${len})`;

    const pkVal = colMap.pk >= 0 ? String(row[colMap.pk] || '').trim().toUpperCase() : '';
    const isPk = pkVal === 'Y' || pkVal === 'YES' || pkVal === 'PK' || pkVal === '○' || pkVal === '1';

    const nnVal = colMap.notNull >= 0 ? String(row[colMap.notNull] || '').trim().toUpperCase() : '';
    const isNotNull = isPk || nnVal === 'Y' || nnVal === 'YES' || nnVal === 'NOT NULL' || nnVal === '○' || nnVal === '1';

    // 外部キー (Ref) の抽出
    const parentTbl = colMap.parentTable >= 0 ? String(row[colMap.parentTable] || '').trim() : '';
    const parentCol = colMap.parentColumn >= 0 ? String(row[colMap.parentColumn] || '').trim() : '';
    if (parentTbl && parentCol) {
      refs.push({
        fromTable: currentTable.name,
        fromColumn: colPhys,
        toTable: parentTbl,
        toColumn: parentCol,
      });
    }

    currentTable.fields.push({
      name: colPhys,
      logicalName: colLogic,
      type: fullType,
      pk: isPk,
      not_null: isNotNull,
      dbdefault: colMap.defaultValue >= 0 ? String(row[colMap.defaultValue] || '').trim() : '',
      definition: colMap.attrDef >= 0 ? String(row[colMap.attrDef] || '').trim() : '',
      columnNote: colMap.attrNote >= 0 ? String(row[colMap.attrNote] || '').trim() : '',
      domainName: colMap.domainName >= 0 ? String(row[colMap.domainName] || '').trim() : '',
      defaultName: colMap.defaultName >= 0 ? String(row[colMap.defaultName] || '').trim() : '',
      lookupName: colMap.lookupName >= 0 ? String(row[colMap.lookupName] || '').trim() : '',
      ruleName: colMap.ruleName >= 0 ? String(row[colMap.ruleName] || '').trim() : '',
      checkRule: colMap.checkRule >= 0 ? String(row[colMap.checkRule] || '').trim() : '',
      remarks: colMap.attrRemarks >= 0 ? String(row[colMap.attrRemarks] || '').trim() : '',
      parentTable: parentTbl,
      parentColumn: parentCol,
    });
  }

  const tables = Array.from(tablesMap.values());
  tables.refs = refs;
  return tables;
}

/**
 * 抽出されたテーブル一覧から標準 DBML + Metadata ブロックテキストを生成
 * @param {Array<Object>} tables - テーブル定義配列
 * @param {string} schemaName - プロジェクトスキーマ名
 * @param {Array<Object>} [inputRefs] - 外部キーリレーション配列
 * @returns {string} DBML テキスト
 */
export function convertTablesToDbml(tables = [], schemaName = 'imported_excel', inputRefs = null) {
  const chunks = [];
  const metaBlocks = [];
  const refs = inputRefs || tables.refs || [];

  chunks.push(`Project "${schemaName}" {\n  database_type: 'standard'\n  version: '1.0.0'\n}\n`);

  for (const tbl of tables) {
    const tblName = `"${tbl.name}"`;
    const cleanTblLogical = tbl.logicalName ? String(tbl.logicalName).replace(/[\r\n]+/g, '').trim() : '';
    const tblSettingsStr = cleanTblLogical ? ` [logicalName: '${escapeInlineString(cleanTblLogical)}']` : '';
    chunks.push(`Table ${tblName}${tblSettingsStr} {`);

    // 空テーブルガード: カラムが0件だと @dbml/core で構文エラー (A Table must have at least one column) になるため自動補完
    if (!tbl.fields || tbl.fields.length === 0) {
      chunks.push("  \"_placeholder\" integer [note: 'Excel設計書カラム未定義']");
    }

    const pkCols = [];
    for (const f of tbl.fields) {
      const fieldName = `"${f.name}"`;
      const settings = [];
      if (f.not_null) settings.push('not null');
      if (f.dbdefault) settings.push(`default: '${escapeInlineString(f.dbdefault)}'`);
      if (f.pk) pkCols.push(`"${f.name}"`);
      const cleanColLogical = f.logicalName ? String(f.logicalName).replace(/[\r\n]+/g, '').trim() : '';
      if (cleanColLogical) settings.push(`logicalName: '${escapeInlineString(cleanColLogical)}'`);

      const noteText = f.columnNote || f.definition;
      if (noteText) {
        settings.push(`note: '${escapeInlineString(noteText)}'`);
      }

      const settingsStr = settings.length > 0 ? ` [${settings.join(', ')}]` : '';
      chunks.push(`  ${fieldName} ${f.type}${settingsStr}`);

      // カラムの Metadata Column ブロック（logicalName 以外の設計属性）
      const colMeta = {};
      if (f.definition) colMeta.definition = f.definition;
      if (f.columnNote) colMeta.columnNote = f.columnNote;
      if (f.domainName) colMeta.domainName = f.domainName;
      if (f.defaultName) colMeta.defaultName = f.defaultName;
      if (f.lookupName) colMeta.lookupName = f.lookupName;
      if (f.ruleName) colMeta.ruleName = f.ruleName;
      if (f.checkRule) colMeta.checkRule = f.checkRule;
      if (f.remarks) colMeta.remarks = f.remarks;

      if (Object.keys(colMeta).length > 0) {
        const metaLines = Object.entries(colMeta).map(([k, v]) => `  ${k}: ${formatMetadataValue(v)}`);
        metaBlocks.push(`Metadata Column ${tblName}.${fieldName} {\n${metaLines.join('\n')}\n}`);
      }
    }

    if (pkCols.length > 0) {
      chunks.push('\n  Indexes {');
      const target = pkCols.length > 1 ? `(${pkCols.join(', ')})` : pkCols[0];
      chunks.push(`    ${target} [pk, name: "PK_${tbl.name}"]`);
      chunks.push('  }');
    }

    const tblNote = tbl.entityNote || tbl.definition || tbl.remarks;
    if (tblNote) {
      chunks.push(`\n  Note: '''\n  ${escapeBlockString(tblNote)}\n  '''`);
    }

    chunks.push('}\n');

    // テーブルの Metadata Table ブロック（logicalName 以外の属性）
    const tblMeta = {};
    if (tbl.definition) tblMeta.definition = tbl.definition;
    if (tbl.entityNote) tblMeta.entityNote = tbl.entityNote;
    if (tbl.remarks) tblMeta.remarks = tbl.remarks;
    if (tbl.tablespace) tblMeta.tablespace = tbl.tablespace;
    if (tbl.index_tablespace) tblMeta.index_tablespace = tbl.index_tablespace;
    if (tbl.lob_tablespace) tblMeta.lob_tablespace = tbl.lob_tablespace;

    if (Object.keys(tblMeta).length > 0) {
      const metaLines = Object.entries(tblMeta).map(([k, v]) => `  ${k}: ${formatMetadataValue(v)}`);
      metaBlocks.push(`Metadata Table ${tblName} {\n${metaLines.join('\n')}\n}`);
    }
  }

  // 外部キー (Ref) の出力: Ref: "子テーブル"."子カラム" > "親テーブル"."親カラム"
  if (refs && refs.length > 0) {
    chunks.push('// 外部キーリレーション (Ref)');
    const seenRefs = new Set();
    for (const r of refs) {
      if (!r.fromTable || !r.fromColumn || !r.toTable || !r.toColumn) continue;
      const refKey = `${r.fromTable}.${r.fromColumn}>${r.toTable}.${r.toColumn}`;
      if (!seenRefs.has(refKey)) {
        seenRefs.add(refKey);
        chunks.push(`Ref: "${r.fromTable}"."${r.fromColumn}" > "${r.toTable}"."${r.toColumn}"`);
      }
    }
    chunks.push('');
  }

  if (metaBlocks.length > 0) {
    chunks.push('');
    chunks.push(metaBlocks.join('\n\n'));
    chunks.push('');
  }

  return chunks.join('\n');
}

/**
 * ER/Studio Excel インポーターファクトリ
 */
export function createErStudioExcelImporter(context) {
  return {
    id: 'erstudio-excel',
    type: 'excel',
    displayNameKey: 'importerTitle',

    async execute(fileData, options = {}) {
      const XLSX = context?.libs?.xlsx;
      if (!XLSX || typeof XLSX.read !== 'function') {
        throw new Error('SheetJS (xlsx) ライブラリが利用できません (requires: ["xlsx"])');
      }

      let workbook;
      if (typeof fileData === 'string') {
        workbook = XLSX.read(fileData, { type: 'binary' });
      } else {
        workbook = XLSX.read(fileData, { type: 'array' });
      }

      const sheetNames = workbook.SheetNames || [];
      if (sheetNames.length === 0) {
        throw new Error('Excelブック内にシートが見つかりません。');
      }

      // 1. 「テーブル一覧」シートの探索と解析
      const tableListSheetName = sheetNames.find(
        (s) =>
          /テーブル一覧|エンティティ一覧|table\s*list|tables/i.test(s) &&
          !/属性|カラム|column|attribute/i.test(s)
      );

      let tableListMap = new Map();
      if (tableListSheetName && workbook.Sheets[tableListSheetName]) {
        const listRows = XLSX.utils.sheet_to_json(workbook.Sheets[tableListSheetName], { header: 1, defval: '' });
        tableListMap = parseTableListSheetRows(listRows);
      }

      // 2. 「属性」詳細シートの探索と解析
      let attrSheetName = sheetNames.find((s) => /属性|カラム|column|attribute|field/i.test(s));

      // 見つからない場合はテーブル一覧以外のシート、または先頭シート
      if (!attrSheetName) {
        attrSheetName = sheetNames.find((s) => s !== tableListSheetName) || sheetNames[0];
      }

      const worksheet = workbook.Sheets[attrSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      const tables = parseErStudioSheetRows(rows);
      if (tables.length === 0 && tableListMap.size === 0) {
        throw new Error(`シート「${attrSheetName}」からテーブル定義が検出できませんでした。`);
      }

      // 3. テーブル一覧シートの情報でテーブル情報を補完
      const tablesMap = new Map(tables.map((t) => [t.name.toUpperCase(), t]));

      for (const [tblKey, listInfo] of tableListMap.entries()) {
        if (tablesMap.has(tblKey)) {
          const t = tablesMap.get(tblKey);
          if (!t.logicalName && listInfo.logicalName) t.logicalName = listInfo.logicalName;
          if (!t.definition && listInfo.definition) t.definition = listInfo.definition;
          if (!t.entityNote && listInfo.entityNote) t.entityNote = listInfo.entityNote;
          if (!t.remarks && listInfo.remarks) t.remarks = listInfo.remarks;
          if (listInfo.tablespace) t.tablespace = listInfo.tablespace;
          if (listInfo.index_tablespace) t.index_tablespace = listInfo.index_tablespace;
          if (listInfo.lob_tablespace) t.lob_tablespace = listInfo.lob_tablespace;
        } else {
          // テーブル一覧にのみ存在するテーブルを追加
          const newTbl = {
            name: listInfo.name,
            logicalName: listInfo.logicalName,
            definition: listInfo.definition,
            entityNote: listInfo.entityNote,
            remarks: listInfo.remarks,
            tablespace: listInfo.tablespace,
            index_tablespace: listInfo.index_tablespace,
            lob_tablespace: listInfo.lob_tablespace,
            fields: [],
          };
          tables.push(newTbl);
          tablesMap.set(tblKey, newTbl);
        }
      }

      const refs = tables.refs || [];
      const dbml = convertTablesToDbml(tables, options.schemaName || 'imported_excel', refs);
      return {
        success: true,
        dbml,
        tableCount: tables.length,
        refCount: refs.length,
      };
    },
  };
}
