// 日本語コメント: ER/Studio 設計メタデータ属性定義 (plugins/erstudio-excel/config.js)
// テーブル・カラムの論理名 (logicalName) の有効化および ER/Studio 準拠の 11 の設計属性定義を提供します。

export const erStudioMetadataDef = {
  // ★ テーブル・カラムの「論理名 (logicalName)」機能を有効化
  enableLogicalName: true,

  projectAttributes: [],

  // テーブルレベル設計属性 (3項目)
  tableAttributes: [
    { key: 'definition', labelKey: 'tableAttrs.definition', type: 'textarea', scope: 'global', group: 'design' },
    { key: 'entityNote', labelKey: 'tableAttrs.entityNote', type: 'textarea', scope: 'global', group: 'design' },
    { key: 'remarks',    labelKey: 'tableAttrs.remarks',    type: 'textarea', scope: 'global', group: 'design' },
  ],

  // カラムレベル設計属性 (8項目)
  columnAttributes: [
    { key: 'definition',  labelKey: 'colAttrs.definition',  type: 'textarea', scope: 'global', group: 'design' },
    { key: 'columnNote',  labelKey: 'colAttrs.columnNote',  type: 'textarea', scope: 'global', group: 'design' },
    { key: 'domainName',  labelKey: 'colAttrs.domainName',  type: 'string',   scope: 'global', group: 'design' },
    { key: 'defaultName', labelKey: 'colAttrs.defaultName', type: 'string',   scope: 'global', group: 'design' },
    { key: 'lookupName',  labelKey: 'colAttrs.lookupName',  type: 'string',   scope: 'global', group: 'design' },
    { key: 'ruleName',    labelKey: 'colAttrs.ruleName',    type: 'string',   scope: 'global', group: 'design' },
    { key: 'checkRule',   labelKey: 'colAttrs.checkRule',   type: 'string',   scope: 'global', group: 'design' },
    { key: 'remarks',     labelKey: 'colAttrs.remarks',     type: 'textarea', scope: 'global', group: 'design' },
  ],
};

