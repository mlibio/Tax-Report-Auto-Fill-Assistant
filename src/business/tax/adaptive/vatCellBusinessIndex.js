import {
  APPENDIX1_TOTAL,
  APPENDIX2_TOTAL,
  APPENDIX3_TOTAL,
  APPENDIX4_TOTAL,
  MAIN_LINES,
  META_FIELDS,
  SHEET_NAMES,
} from '../schema/vatGeneralSchema';

export const VAT_SHEET_ALIAS = {
  Sheet1: SHEET_NAMES.main,
  Sheet2: SHEET_NAMES.appendix1,
  Sheet3: SHEET_NAMES.appendix2,
  Sheet4: SHEET_NAMES.appendix3,
  Sheet5: SHEET_NAMES.appendix4,
  Sheet6: '附列资料五',
};

const SHEET_NAME_TO_ALIAS = Object.entries(VAT_SHEET_ALIAS).reduce(
  (acc, [alias, sheetName]) => {
    acc[sheetName] = alias;
    return acc;
  },
  {}
);

const MAIN_COLUMN_LABELS = {
  generalCurrent: '一般项目 本月数',
  generalYear: '一般项目 本年累计',
  refundCurrent: '即征即退项目 本月数',
  refundYear: '即征即退项目 本年累计',
};

const APPENDIX5_NAME = '附列资料五';

const APPENDIX_LINE_NO_COLUMNS = {
  [SHEET_NAMES.appendix1]: [3],
  [SHEET_NAMES.appendix2]: [3],
  [SHEET_NAMES.appendix3]: [1],
  [SHEET_NAMES.appendix4]: [0, 2],
  [APPENDIX5_NAME]: [1, 11],
};

const APPENDIX_CONTEXT_CONFIGS = {
  [SHEET_NAMES.appendix1]: {
    rowLabelCols: [0, 1, 2],
    lineNoCols: [3],
    headerRows: [
      { row: 4, carryLeft: true },
      { row: 5, carryLeft: false },
    ],
    columnLineRows: [6],
  },
  [SHEET_NAMES.appendix3]: {
    rowLabelCols: [0],
    lineNoCols: [1],
    headerRows: [
      { row: 4, carryLeft: true },
      { row: 5, carryLeft: false },
    ],
    columnLineRows: [6],
  },
};

function cellKey(sheetAlias, rowIndex, colIndex) {
  return `${sheetAlias}:${rowIndex}:${colIndex}`;
}

function toInt(value) {
  const num = Number(value);
  return Number.isInteger(num) && num >= 0 ? num : null;
}

function normalizeText(value) {
  if (value === null || typeof value === 'undefined') return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function colToA1(colIndex) {
  let n = colIndex + 1;
  let s = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - mod) / 26);
  }
  return s;
}

export function formatCellRef(sheetAlias, rowIndex, colIndex) {
  return `${sheetAlias}!${colToA1(colIndex)}${rowIndex + 1}`;
}

export function parseVatCellRef(raw) {
  if (typeof raw !== 'string') return null;
  const match = raw.match(
    /\{\{\s*(variables)[@.]((Sheet\d+)\.(\d+)\.(\d+))\s*\}\}/
  );
  if (!match) return null;

  const rowIndex = toInt(match[4]);
  const colIndex = toInt(match[5]);
  if (rowIndex === null || colIndex === null) return null;

  return {
    raw: match[0],
    dataKey: match[1],
    path: match[2],
    sheetAlias: match[3],
    sheetName: VAT_SHEET_ALIAS[match[3]] || match[3],
    rowIndex,
    colIndex,
    cellRef: formatCellRef(match[3], rowIndex, colIndex),
  };
}

function addStaticEntry(index, entry) {
  index[cellKey(entry.sheetAlias, entry.rowIndex, entry.colIndex)] = {
    ...entry,
    cellRef: formatCellRef(entry.sheetAlias, entry.rowIndex, entry.colIndex),
    source: 'schema',
  };
}

function buildStaticIndex() {
  const index = {};

  for (const field of META_FIELDS) {
    const sheetAlias = SHEET_NAME_TO_ALIAS[field.sheet];
    if (sheetAlias) {
      addStaticEntry(index, {
        sheetAlias,
        sheetName: field.sheet,
        rowIndex: field.cell[0],
        colIndex: field.cell[1],
        fieldPath: `meta.${field.id}`,
        label: field.label,
        type: field.type,
        keywords: [field.label],
      });
    }
  }

  for (const line of MAIN_LINES) {
    const sheetAlias = SHEET_NAME_TO_ALIAS[line.sheet];
    if (sheetAlias) {
      for (const [columnKey, cell] of Object.entries(line.columns || {})) {
        addStaticEntry(index, {
          sheetAlias,
          sheetName: line.sheet,
          rowIndex: cell[0],
          colIndex: cell[1],
          fieldPath: `lines.${line.id}.${columnKey}`,
          label: line.label,
          lineNo: line.line,
          columnLabel: MAIN_COLUMN_LABELS[columnKey] || columnKey,
          type: line.type,
          keywords: [
            line.label,
            `第${line.line}栏`,
            `${line.line}栏`,
            MAIN_COLUMN_LABELS[columnKey],
          ],
        });
      }
    }
  }

  const appendixTotals = [
    {
      sheetName: APPENDIX1_TOTAL.sheet,
      prefix: 'appendix.appendix1',
      cells: APPENDIX1_TOTAL.totalCell,
      labels: {
        sales: '附列资料一合计销售额',
        outputTax: '附列资料一合计销项税额',
      },
    },
    {
      sheetName: APPENDIX2_TOTAL.sheet,
      prefix: 'appendix.appendix2',
      cells: APPENDIX2_TOTAL.totalCell,
      labels: {
        count: '附列资料二合计份数',
        amount: '附列资料二合计金额',
        tax: '附列资料二合计税额',
      },
    },
    {
      sheetName: APPENDIX3_TOTAL.sheet,
      prefix: 'appendix.appendix3',
      cells: APPENDIX3_TOTAL.totalCell,
      labels: { deduction: '附列资料三扣除项目合计' },
    },
    {
      sheetName: APPENDIX4_TOTAL.sheet,
      prefix: 'appendix.appendix4',
      cells: APPENDIX4_TOTAL.totalCell,
      labels: { endingBalance: '附列资料四期末余额' },
    },
  ];

  for (const group of appendixTotals) {
    const sheetAlias = SHEET_NAME_TO_ALIAS[group.sheetName];
    if (sheetAlias) {
      for (const [key, cell] of Object.entries(group.cells)) {
        addStaticEntry(index, {
          sheetAlias,
          sheetName: group.sheetName,
          rowIndex: cell[0],
          colIndex: cell[1],
          fieldPath: `${group.prefix}.${key}`,
          label: group.labels[key] || key,
          columnLabel: group.labels[key] || key,
          type: 'number',
          keywords: [group.sheetName, group.labels[key], '合计'],
        });
      }
    }
  }

  return index;
}

const STATIC_INDEX = buildStaticIndex();

function asMatrix(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function sliceText(values, limit = 12) {
  return values.map(normalizeText).filter(Boolean).slice(0, limit);
}

function uniqueText(values) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
}

function readMatrixText(matrix, rowIndex, colIndex) {
  return normalizeText(matrix?.[rowIndex]?.[colIndex]);
}

function isNumericLikeText(text) {
  const str = normalizeText(text).replace(/,/g, '');
  if (!str || /^[—-]+$/.test(str)) return true;
  return /^-?\d+(?:\.\d+)?%?$/.test(str);
}

function isFormulaLineText(text) {
  const str = normalizeText(text);
  return /^\d{1,3}[a-z]?\s*=/.test(str);
}

function isBusinessText(text) {
  const str = normalizeText(text);
  if (!str) return false;
  if (isNumericLikeText(str) || isFormulaLineText(str)) return false;
  return /[\u4e00-\u9fa5A-Za-z]/.test(str);
}

function carryTextUp(matrix, rowIndex, colIndex, maxRows = 25) {
  for (let r = rowIndex; r >= 0 && rowIndex - r <= maxRows; r -= 1) {
    const text = readMatrixText(matrix, r, colIndex);
    if (text) return text;
  }
  return '';
}

function readHeaderText(matrix, rowIndex, colIndex, carryLeft = false) {
  const direct = readMatrixText(matrix, rowIndex, colIndex);
  if (direct) return direct;
  if (!carryLeft) return '';

  for (let c = colIndex - 1; c >= 0 && colIndex - c <= 8; c -= 1) {
    const text = readMatrixText(matrix, rowIndex, c);
    if (text) return text;
  }
  return '';
}

function findNearestHeaderRow(matrix, rowIndex, lineNoCols) {
  for (let r = rowIndex - 1; r >= 0 && rowIndex - r <= 20; r -= 1) {
    if (
      lineNoCols.some((colIndex) =>
        /栏次|序号/.test(readMatrixText(matrix, r, colIndex))
      )
    ) {
      return r;
    }
  }
  return null;
}

function findNearestSectionTitle(matrix, rowIndex) {
  for (let r = rowIndex; r >= 0 && rowIndex - r <= 20; r -= 1) {
    const text = readMatrixText(matrix, r, 0);
    if (/^[一二三四五六七八九十]+、/.test(text)) return text;
  }
  return '';
}

function normalizeColumnTerm(text) {
  const str = normalizeText(text);
  if (!str) return '';
  return str.replace(/[()（）]/g, '');
}

function expandKeywordVariants(values) {
  const keywords = [];
  for (const value of values) {
    const text = normalizeText(value);
    if (!text) continue;
    keywords.push(text);

    const compact = normalizeColumnTerm(text);
    if (compact && compact !== text) keywords.push(compact);

    if (/销项.*税额/.test(text)) {
      keywords.push('销项税额', '销项应纳税额');
    }
    if (/应纳.*税额/.test(text)) {
      keywords.push('应纳税额');
    }
    if (/税（费）|税费/.test(text)) {
      keywords.push(text.replace(/税（费）/g, '税费'));
    }
  }
  return uniqueText(keywords);
}

function normalizeLineNoValue(value, { allowFormula = false } = {}) {
  const str = normalizeText(value);
  if (!str || /^[—-]+$/.test(str)) return null;

  const compact = str.replace(/\s+/g, '');
  if (/^\d{1,3}[a-z]?$/i.test(compact)) {
    return /^\d+$/.test(compact) ? Number(compact) : compact;
  }
  if (allowFormula && /^\d{1,3}[a-z]?=/.test(compact)) return compact;

  const explicitMatch = compact.match(
    /^(?:第)?(\d{1,3}[a-z]?)(?:栏|行次|行)$/i
  );
  if (!explicitMatch) return null;

  const lineNo = explicitMatch[1];
  return /^\d+$/.test(lineNo) ? Number(lineNo) : lineNo;
}

function extractLineNo(text) {
  const str = normalizeText(text);
  const match = str.match(
    /(?:栏次|行次)\s*[:：]?\s*(\d{1,3}[a-z]?)(?!\d)|(?:第\s*)?(\d{1,3}[a-z]?)\s*(?:栏|行次|行)/i
  );
  if (!match) return null;
  const lineNo = match[1] || match[2];
  return /^\d+$/.test(lineNo) ? Number(lineNo) : lineNo;
}

function extractLineNoFromRow(sourceRef, row, rowText, aboveTextParts) {
  const lineNoCols = APPENDIX_LINE_NO_COLUMNS[sourceRef.sheetName];
  if (Array.isArray(lineNoCols)) {
    for (const lineNoCol of lineNoCols) {
      const lineNo = normalizeLineNoValue(row[lineNoCol], {
        allowFormula: true,
      });
      if (lineNo) return lineNo;
    }

    for (let i = aboveTextParts.length - 1; i >= 0; i -= 1) {
      const lineNo = normalizeLineNoValue(aboveTextParts[i], {
        allowFormula: true,
      });
      if (lineNo) return lineNo;
    }

    return null;
  }

  return extractLineNo(rowText);
}

function formatLineNoLabel(lineNo) {
  if (!lineNo) return '';
  const str = String(lineNo);
  return /^\d{1,3}[a-z]?$/i.test(str) ? `第${str}栏` : `栏次${str}`;
}

function getAppendixConfig(sourceRef, matrix) {
  const base = APPENDIX_CONTEXT_CONFIGS[sourceRef.sheetName];
  if (base) return base;

  if (sourceRef.sheetName === SHEET_NAMES.appendix2) {
    const lineNoCols = [3];
    const headerRow = findNearestHeaderRow(
      matrix,
      sourceRef.rowIndex,
      lineNoCols
    );
    if (headerRow === null) return null;

    return {
      rowLabelCols: [0, 1, 2],
      lineNoCols,
      headerRows: [{ row: headerRow, carryLeft: true }],
      sectionTitle: findNearestSectionTitle(matrix, sourceRef.rowIndex),
    };
  }

  if (sourceRef.sheetName === SHEET_NAMES.appendix4) {
    const lineNoCols = [0];
    const headerRow = findNearestHeaderRow(
      matrix,
      sourceRef.rowIndex,
      lineNoCols
    );
    if (headerRow === null) return null;

    return {
      rowLabelCols: [1],
      lineNoCols,
      headerRows: [{ row: headerRow, carryLeft: true }],
      columnLineRows: [headerRow + 1],
      sectionTitle: findNearestSectionTitle(matrix, sourceRef.rowIndex),
    };
  }

  if (sourceRef.sheetName === APPENDIX5_NAME) {
    const isPolicyArea = sourceRef.rowIndex >= 11;
    return {
      rowLabelCols: isPolicyArea ? [0, 6] : [0],
      lineNoCols: isPolicyArea ? [11, 1] : [1, 11],
      headerRows: [
        { row: 4, carryLeft: true },
        { row: 5, carryLeft: true, skipCarryLeftCols: [5, 6, 12, 13] },
      ],
      columnLineRows: [6],
    };
  }

  return null;
}

function getRowLabelParts(matrix, sourceRef, config) {
  const parts = [];
  if (config.sectionTitle) parts.push(config.sectionTitle);

  for (const colIndex of config.rowLabelCols || []) {
    const text = carryTextUp(matrix, sourceRef.rowIndex, colIndex);
    if (isBusinessText(text)) parts.push(text);
  }

  return uniqueText(parts);
}

function getLineNoFromConfig(matrix, sourceRef, config) {
  for (const colIndex of config.lineNoCols || []) {
    const lineNo = normalizeLineNoValue(
      readMatrixText(matrix, sourceRef.rowIndex, colIndex),
      { allowFormula: true }
    );
    if (lineNo) return lineNo;
  }
  return null;
}

function getColumnLabelParts(matrix, sourceRef, config) {
  const parts = [];

  for (const header of config.headerRows || []) {
    const text = readHeaderText(
      matrix,
      header.row,
      sourceRef.colIndex,
      header.carryLeft &&
        !(header.skipCarryLeftCols || []).includes(sourceRef.colIndex)
    );
    if (isBusinessText(text) && !/项目及栏次|项目|栏次|序号/.test(text)) {
      parts.push(text);
    }
  }

  return uniqueText(parts);
}

function getColumnLineNo(matrix, sourceRef, config) {
  for (const rowIndex of config.columnLineRows || []) {
    const lineNo = normalizeLineNoValue(
      readMatrixText(matrix, rowIndex, sourceRef.colIndex),
      { allowFormula: true }
    );
    if (lineNo) return lineNo;
  }
  return null;
}

function buildConfiguredAppendixContext(sourceRef, matrix) {
  const config = getAppendixConfig(sourceRef, matrix);
  if (!config) return null;

  const row = Array.isArray(matrix[sourceRef.rowIndex])
    ? matrix[sourceRef.rowIndex]
    : [];
  const rowTextParts = sliceText(row);
  const rowText = rowTextParts.join(' ');
  const rowLabelParts = getRowLabelParts(matrix, sourceRef, config);
  const rowLabel = rowLabelParts.join(' ');
  const columnLabelParts = getColumnLabelParts(matrix, sourceRef, config);
  const columnText = columnLabelParts.join(' ');
  const lineNo =
    getLineNoFromConfig(matrix, sourceRef, config) || extractLineNo(rowText);
  const columnLineNo = getColumnLineNo(matrix, sourceRef, config);
  const lineNoLabel = formatLineNoLabel(lineNo);

  const labelParts = [
    sourceRef.sheetName,
    lineNoLabel,
    rowLabelParts[rowLabelParts.length - 1] || rowLabel,
    columnText,
  ].filter(Boolean);
  const label =
    labelParts.join(' ') || `${sourceRef.sheetName} ${sourceRef.cellRef}`;
  const keywords = expandKeywordVariants([
    sourceRef.sheetName,
    ...rowLabelParts,
    ...columnLabelParts,
    lineNoLabel,
    lineNo ? `${lineNo}栏` : '',
    columnLineNo ? `第${columnLineNo}列` : '',
  ]);

  return {
    ...sourceRef,
    fieldPath: `${sourceRef.sheetAlias}.${sourceRef.rowIndex}.${sourceRef.colIndex}`,
    label,
    rowLabel,
    rowLabelParts,
    lineNo,
    columnLineNo,
    rowText,
    columnText,
    columnLabelParts,
    leftText: rowLabel,
    keywords,
    source: 'sheet-context',
  };
}

function buildDynamicContext(sourceRef, refData) {
  const matrix = asMatrix(refData?.variables?.[sourceRef.sheetAlias]);
  if (!matrix) {
    return {
      ...sourceRef,
      fieldPath: `${sourceRef.sheetAlias}.${sourceRef.rowIndex}.${sourceRef.colIndex}`,
      label: `${sourceRef.sheetName} ${sourceRef.cellRef}`,
      keywords: [sourceRef.sheetName],
      source: 'cell-ref',
      reason: 'sheet-matrix-missing',
    };
  }

  const configuredContext = buildConfiguredAppendixContext(sourceRef, matrix);
  if (configuredContext) return configuredContext;

  const row = Array.isArray(matrix[sourceRef.rowIndex])
    ? matrix[sourceRef.rowIndex]
    : [];
  const rowTextParts = sliceText(row);
  const leftTextParts = sliceText(row.slice(0, sourceRef.colIndex), 8);
  const aboveTextParts = [];
  for (
    let r = Math.max(0, sourceRef.rowIndex - 8);
    r < sourceRef.rowIndex;
    r += 1
  ) {
    const text = normalizeText(matrix[r]?.[sourceRef.colIndex]);
    if (text) aboveTextParts.push(text);
  }

  const rowText = rowTextParts.join(' ');
  const columnText = aboveTextParts.slice(-4).join(' ');
  const lineNo = extractLineNoFromRow(sourceRef, row, rowText, aboveTextParts);
  const lineNoLabel = formatLineNoLabel(lineNo);
  const labelParts = [
    sourceRef.sheetName,
    lineNoLabel,
    leftTextParts.slice(-2).join(' '),
    columnText,
  ].filter(Boolean);

  const keywords = Array.from(
    new Set(
      [
        sourceRef.sheetName,
        ...leftTextParts,
        ...aboveTextParts,
        lineNoLabel,
        lineNo ? `${lineNo}栏` : '',
      ].filter(Boolean)
    )
  );

  return {
    ...sourceRef,
    fieldPath: `${sourceRef.sheetAlias}.${sourceRef.rowIndex}.${sourceRef.colIndex}`,
    label:
      labelParts.join(' ') || `${sourceRef.sheetName} ${sourceRef.cellRef}`,
    lineNo,
    rowText,
    columnText,
    leftText: leftTextParts.join(' '),
    keywords,
    source: 'sheet-context',
  };
}

export function buildVatCellBusinessContext(rawValue, refData) {
  const sourceRef = parseVatCellRef(rawValue);
  if (!sourceRef) return null;

  const staticEntry =
    STATIC_INDEX[
      cellKey(sourceRef.sheetAlias, sourceRef.rowIndex, sourceRef.colIndex)
    ];
  if (staticEntry) {
    return {
      ...sourceRef,
      ...staticEntry,
      sourceRef,
    };
  }

  return {
    ...buildDynamicContext(sourceRef, refData),
    sourceRef,
  };
}

export default buildVatCellBusinessContext;
