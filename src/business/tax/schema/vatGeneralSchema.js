/**
 * 增值税及附加税费申报表（一般纳税人适用）固定 Schema
 *
 * 该 Schema 用于把上海市电子税务局下载的固定模板 Excel
 * 「1.《增值税及附加税费申报表（一般纳税人适用）》及其附列资料-test.xls」
 * 解析为内部稳定的数据模型。
 *
 * 单元格坐标使用 0 起的 [row, col] 二维数组下标，
 * 取自 xlsx 库 `sheet_to_json(s, { header: 1, defval: null, blankrows: true })`
 * 的结果数组。列下标对应 Excel 字母列（A=0, B=1, ..., N=13, S=18, Z=25, AJ=35, AN=39）。
 *
 * 任何列号/行号变化都意味着模板变更，应在导入时被指纹校验拦截。
 */

export const SCHEMA_VERSION = '2025.04.01';

export const SHEET_NAMES = {
  main: '主表',
  appendix1: '附列资料一',
  appendix2: '附列资料二',
  appendix3: '附列资料三',
  appendix4: '附列资料四',
};

const ROW_OFFSET_FROM_LINE = 9;

export function lineCellOf(line, columnLabel) {
  return [line + ROW_OFFSET_FROM_LINE, columnLabel];
}

const LINE_COLUMNS = {
  generalCurrent: 18,
  generalYear: 25,
  refundCurrent: 35,
  refundYear: 39,
};

function lineField(id, line, label, opts = {}) {
  return {
    id,
    label,
    line,
    sheet: SHEET_NAMES.main,
    cell: lineCellOf(line, LINE_COLUMNS.generalCurrent),
    type: 'number',
    required: opts.required ?? false,
    nonNegative: opts.nonNegative ?? true,
    columns: {
      generalCurrent: lineCellOf(line, LINE_COLUMNS.generalCurrent),
      generalYear: lineCellOf(line, LINE_COLUMNS.generalYear),
      refundCurrent: lineCellOf(line, LINE_COLUMNS.refundCurrent),
      refundYear: lineCellOf(line, LINE_COLUMNS.refundYear),
    },
    formula: opts.formula || null,
    description: opts.description || '',
  };
}

export const META_FIELDS = [
  {
    id: 'periodRange',
    label: '税款所属时间',
    sheet: SHEET_NAMES.main,
    cell: [4, 18],
    type: 'string',
    required: true,
  },
  {
    id: 'reportDate',
    label: '申报日期',
    sheet: SHEET_NAMES.main,
    cell: [4, 35],
    type: 'string',
    required: false,
  },
  {
    id: 'taxpayerNo',
    label: '纳税人识别号',
    sheet: SHEET_NAMES.main,
    cell: [5, 9],
    type: 'string',
    required: true,
    pattern: /^[0-9A-Z]{15,18}$/,
  },
  {
    id: 'industry',
    label: '所属行业',
    sheet: SHEET_NAMES.main,
    cell: [5, 39],
    type: 'string',
    required: false,
  },
  {
    id: 'taxpayerName',
    label: '纳税人名称',
    sheet: SHEET_NAMES.main,
    cell: [6, 0],
    type: 'string',
    required: true,
    transform: (raw) =>
      (raw || '')
        .toString()
        .replace(/^\s*纳税人名称\s*[:：]\s*/, '')
        .trim(),
  },
  {
    id: 'legalPerson',
    label: '法定代表人',
    sheet: SHEET_NAMES.main,
    cell: [6, 18],
    type: 'string',
    required: false,
  },
  {
    id: 'registeredAddress',
    label: '注册地址',
    sheet: SHEET_NAMES.main,
    cell: [6, 24],
    type: 'string',
    required: false,
  },
  {
    id: 'businessAddress',
    label: '生产经营地址',
    sheet: SHEET_NAMES.main,
    cell: [6, 39],
    type: 'string',
    required: false,
  },
  {
    id: 'bankAccount',
    label: '开户银行及账号',
    sheet: SHEET_NAMES.main,
    cell: [7, 4],
    type: 'string',
    required: false,
  },
  {
    id: 'registrationType',
    label: '登记注册类型',
    sheet: SHEET_NAMES.main,
    cell: [7, 21],
    type: 'string',
    required: false,
  },
  {
    id: 'phone',
    label: '电话号码',
    sheet: SHEET_NAMES.main,
    cell: [7, 40],
    type: 'string',
    required: false,
  },
];

/**
 * 主表栏次（line 1..41）。
 * key = `lineN`，便于业务规则引用。
 */
export const MAIN_LINES = [
  lineField('line1', 1, '按适用税率计税销售额', { required: true }),
  lineField('line2', 2, '其中：应税货物销售额'),
  lineField('line3', 3, '应税劳务销售额'),
  lineField('line4', 4, '纳税检查调整的销售额'),
  lineField('line5', 5, '按简易办法计税销售额'),
  lineField('line6', 6, '其中：纳税检查调整的销售额'),
  lineField('line7', 7, '免、抵、退办法出口销售额'),
  lineField('line8', 8, '免税销售额'),
  lineField('line9', 9, '其中：免税货物销售额'),
  lineField('line10', 10, '免税劳务销售额'),
  lineField('line11', 11, '销项税额', { required: true }),
  lineField('line12', 12, '进项税额', { required: true }),
  lineField('line13', 13, '上期留抵税额'),
  lineField('line14', 14, '进项税额转出'),
  lineField('line15', 15, '免抵退应退税额'),
  lineField('line16', 16, '按适用税率计算的纳税检查应补缴税额'),
  lineField('line17', 17, '应抵扣税额合计', {
    formula: 'line12 + line13 - line14 - line15 + line16',
  }),
  lineField('line18', 18, '实际抵扣税额', {
    formula: 'min(line17, line11)',
  }),
  lineField('line19', 19, '应纳税额', {
    formula: 'line11 - line18',
  }),
  lineField('line20', 20, '期末留抵税额', {
    formula: 'line17 - line18',
  }),
  lineField('line21', 21, '简易计税办法计算的应纳税额'),
  lineField('line22', 22, '按简易计税办法计算的纳税检查应补缴税额'),
  lineField('line23', 23, '应纳税额减征额'),
  lineField('line24', 24, '应纳税额合计', {
    required: true,
    formula: 'line19 + line21 - line23',
  }),
  lineField('line25', 25, '期初未缴税额（多缴为负数）', { nonNegative: false }),
  lineField('line26', 26, '实收出口开具专用缴款书退税额'),
  lineField('line27', 27, '本期已缴税额', {
    formula: 'line28 + line29 + line30 + line31',
  }),
  lineField('line28', 28, '①分次预缴税额'),
  lineField('line29', 29, '②出口开具专用缴款书预缴税额'),
  lineField('line30', 30, '③本期缴纳上期应纳税额'),
  lineField('line31', 31, '④本期缴纳欠缴税额'),
  lineField('line32', 32, '期末未缴税额（多缴为负数）', {
    nonNegative: false,
    formula: 'line24 + line25 + line26 - line27',
  }),
  lineField('line33', 33, '其中：欠缴税额（≥0）', {
    formula: 'line25 + line26 - line27',
  }),
  lineField('line34', 34, '本期应补(退)税额', {
    nonNegative: false,
    formula: 'line24 - line28 - line29',
  }),
  lineField('line35', 35, '即征即退实际退税额'),
  lineField('line36', 36, '期初未缴查补税额', { nonNegative: false }),
  lineField('line37', 37, '本期入库查补税额'),
  lineField('line38', 38, '期末未缴查补税额', {
    nonNegative: false,
    formula: 'line16 + line22 + line36 - line37',
  }),
  lineField('line39', 39, '城市维护建设税本期应补（退）税额', {
    nonNegative: false,
  }),
  lineField('line40', 40, '教育费附加本期应补（退）费额', {
    nonNegative: false,
  }),
  lineField('line41', 41, '地方教育附加本期应补（退）费额', {
    nonNegative: false,
  }),
];

/**
 * 附列资料一（销售情况）合计行 — 用于跨表勾稽。
 * 按当前模板，第 14 行为合计行，列 D=销售额，列 E=销项税额。
 */
export const APPENDIX1_TOTAL = {
  sheet: SHEET_NAMES.appendix1,
  totalCell: { sales: [13, 3], outputTax: [13, 4] },
};

/**
 * 附列资料二（进项税额）合计行 — 第 12 行，列 B=份数，列 C=金额，列 D=税额。
 */
export const APPENDIX2_TOTAL = {
  sheet: SHEET_NAMES.appendix2,
  totalCell: { count: [11, 1], amount: [11, 2], tax: [11, 3] },
};

/**
 * 附列资料三（差额征税扣除项目）合计行 — 第 6 行。
 */
export const APPENDIX3_TOTAL = {
  sheet: SHEET_NAMES.appendix3,
  totalCell: { deduction: [5, 5] },
};

/**
 * 附列资料四（抵减信息）期末余额 — 第 17 行第 8 列。
 */
export const APPENDIX4_TOTAL = {
  sheet: SHEET_NAMES.appendix4,
  totalCell: { endingBalance: [16, 7] },
};

/**
 * 模板指纹：固定单元格的标题文本。
 * 解析时若任一指纹文本对不上，立即抛 ParserError，提醒用户「模板已变更」。
 */
export const TEMPLATE_FINGERPRINTS = [
  { sheet: SHEET_NAMES.main, cell: [10, 13], expectedExact: 1, label: '1栏' },
  { sheet: SHEET_NAMES.main, cell: [20, 13], expectedExact: 11, label: '11栏' },
  { sheet: SHEET_NAMES.main, cell: [21, 13], expectedExact: 12, label: '12栏' },
];

export default {
  SCHEMA_VERSION,
  SHEET_NAMES,
  META_FIELDS,
  MAIN_LINES,
  APPENDIX1_TOTAL,
  APPENDIX2_TOTAL,
  APPENDIX3_TOTAL,
  APPENDIX4_TOTAL,
  TEMPLATE_FINGERPRINTS,
};
