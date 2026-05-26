import { read as readXlsx, utils as utilsXlsx } from 'xlsx';
import vatSchema, {
  SCHEMA_VERSION,
  TEMPLATE_FINGERPRINTS,
  META_FIELDS,
  MAIN_LINES,
  APPENDIX1_TOTAL,
  APPENDIX2_TOTAL,
  APPENDIX3_TOTAL,
  APPENDIX4_TOTAL,
  SHEET_NAMES,
} from '../schema/vatGeneralSchema';

const MIN_PREVIEW_COLUMNS = 41;
const MAX_PREVIEW_EMPTY_GAP = 1;

export class ParserError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'VatParserError';
    this.details = details;
  }
}

function readWorkbookFromInput(input) {
  if (input && typeof input === 'object' && Array.isArray(input.SheetNames)) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return readXlsx(input, { type: 'array' });
  }
  if (input && typeof input.arrayBuffer === 'function') {
    return null;
  }
  if (typeof input === 'string') {
    const commaIdx = input.indexOf(',');
    const base64 = commaIdx >= 0 ? input.slice(commaIdx + 1) : input;
    return readXlsx(base64, { type: 'base64' });
  }
  throw new ParserError('Unsupported Excel input type');
}

async function ensureWorkbook(input) {
  const direct = readWorkbookFromInput(input);
  if (direct) return direct;
  if (input && typeof input.arrayBuffer === 'function') {
    const buffer = await input.arrayBuffer();
    return readXlsx(buffer, { type: 'array' });
  }
  throw new ParserError('Unable to read workbook from input');
}

function sheetToMatrix(sheet) {
  if (!sheet) return [];
  const range = sheet['!ref'] ? utilsXlsx.decode_range(sheet['!ref']) : null;
  if (range) {
    range.s.r = 0;
    range.s.c = 0;
  }
  return utilsXlsx.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
    range,
  });
}

function isBlankCell(cell) {
  return cell === null || cell === undefined || String(cell).trim() === '';
}

function isEmptyRow(row) {
  return !row || row.every(isBlankCell);
}

function trimEmptySheetEdges(matrix) {
  let lastRow = matrix.length - 1;
  while (lastRow >= 0 && isEmptyRow(matrix[lastRow])) {
    lastRow -= 1;
  }

  const rows = matrix.slice(0, lastRow + 1);
  const maxCols = rows.reduce((max, row) => {
    if (!Array.isArray(row)) return max;
    let lastCol = row.length - 1;
    while (lastCol >= 0 && isBlankCell(row[lastCol])) {
      lastCol -= 1;
    }
    return Math.max(max, lastCol + 1);
  }, 0);

  return rows.map((row) =>
    Array.from({ length: maxCols }, (_, index) => row?.[index] ?? null)
  );
}

function collapseEmptyRows(rows, maxGap = MAX_PREVIEW_EMPTY_GAP) {
  const next = [];
  let emptyRun = 0;

  for (const row of rows) {
    if (isEmptyRow(row)) {
      emptyRun += 1;
      if (emptyRun <= maxGap) next.push(row);
    } else {
      emptyRun = 0;
      next.push(row);
    }
  }

  return next;
}

function collapseEmptyColumns(rows, maxGap = MAX_PREVIEW_EMPTY_GAP) {
  if (!rows.length) return rows;

  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const keepIndexes = [];
  let emptyRun = 0;

  for (let colIndex = 0; colIndex < maxCols; colIndex += 1) {
    const isEmptyColumn = rows.every((row) => isBlankCell(row[colIndex]));

    if (isEmptyColumn) {
      emptyRun += 1;
      if (emptyRun <= maxGap) keepIndexes.push(colIndex);
    } else {
      emptyRun = 0;
      keepIndexes.push(colIndex);
    }
  }

  return rows.map((row) =>
    keepIndexes.map((colIndex) => row[colIndex] ?? null)
  );
}

function compactPreviewRows(rows) {
  return collapseEmptyColumns(collapseEmptyRows(trimEmptySheetEdges(rows)));
}

function ensurePreviewSize(rows, minRows, minCols = MIN_PREVIEW_COLUMNS) {
  const next = rows.map((row) => [...row]);
  while (next.length < minRows) next.push([]);

  const maxCols = Math.max(
    minCols,
    next.reduce((max, row) => Math.max(max, row.length), 0)
  );
  return next.map((row) =>
    Array.from({ length: maxCols }, (_, index) => row[index] ?? null)
  );
}

function setIfBlank(rows, rowIndex, colIndex, value) {
  if (!rows[rowIndex]) return;
  const current = rows[rowIndex][colIndex];
  if (current === null || current === undefined || current === '') {
    rows[rowIndex][colIndex] = value;
  }
}

function overlayMainSheetTemplate(rows) {
  const next = ensurePreviewSize(rows, 51);
  setIfBlank(next, 0, 0, '增值税及附加税费申报表（一般纳税人适用）');
  setIfBlank(next, 4, 0, '税款所属时间');
  setIfBlank(next, 4, 34, '申报日期');
  setIfBlank(next, 5, 0, '纳税人识别号');
  setIfBlank(next, 5, 34, '所属行业');
  setIfBlank(next, 6, 0, '纳税人名称');
  setIfBlank(next, 6, 18, '法定代表人');
  setIfBlank(next, 6, 24, '注册地址');
  setIfBlank(next, 6, 34, '生产经营地址');
  setIfBlank(next, 7, 0, '开户银行及账号');
  setIfBlank(next, 7, 18, '登记注册类型');
  setIfBlank(next, 7, 34, '电话号码');

  setIfBlank(next, 9, 0, '项目');
  setIfBlank(next, 9, 13, '栏次');
  setIfBlank(next, 9, 18, '一般项目本月数');
  setIfBlank(next, 9, 26, '一般项目本年累计');
  setIfBlank(next, 9, 35, '即征即退项目本月数');
  setIfBlank(next, 9, 40, '即征即退项目本年累计');

  for (const def of MAIN_LINES) {
    const rowIndex = def.line + 9;
    setIfBlank(next, rowIndex, 0, def.label);
    setIfBlank(next, rowIndex, 13, def.line);
  }

  return next;
}

function overlayAppendixTemplate(sheetName, rows) {
  const next = ensurePreviewSize(rows, 18, 12);
  setIfBlank(next, 0, 0, sheetName);

  if (sheetName === SHEET_NAMES.appendix1) {
    setIfBlank(next, 1, 0, '一、销售情况');
    setIfBlank(next, 2, 0, '项目及栏次');
    setIfBlank(next, 2, 3, '销售额');
    setIfBlank(next, 2, 4, '销项（应纳）税额');
    setIfBlank(next, 13, 0, '合计');
  } else if (sheetName === SHEET_NAMES.appendix2) {
    setIfBlank(next, 1, 0, '一、申报抵扣的进项税额');
    setIfBlank(next, 2, 0, '项目及栏次');
    setIfBlank(next, 2, 1, '份数');
    setIfBlank(next, 2, 2, '金额');
    setIfBlank(next, 2, 3, '税额');
    setIfBlank(next, 11, 0, '合计');
  } else if (sheetName === SHEET_NAMES.appendix3) {
    setIfBlank(next, 1, 0, '服务、不动产和无形资产扣除项目明细');
    setIfBlank(next, 2, 0, '项目及栏次');
    setIfBlank(next, 2, 5, '本期实际扣除金额');
    setIfBlank(next, 5, 0, '合计');
  } else if (sheetName === SHEET_NAMES.appendix4) {
    setIfBlank(next, 1, 0, '税额抵减情况表');
    setIfBlank(next, 2, 0, '项目及栏次');
    setIfBlank(next, 2, 7, '期末余额');
    setIfBlank(next, 16, 0, '合计');
  }

  return next;
}

function overlayVatTemplate(sheetName, matrix) {
  const rows = trimEmptySheetEdges(matrix);
  if (sheetName === SHEET_NAMES.main) return overlayMainSheetTemplate(rows);
  if (Object.values(SHEET_NAMES).includes(sheetName)) {
    return overlayAppendixTemplate(sheetName, rows);
  }
  return rows;
}

function buildPreviewRows(sheetName, sheet) {
  return compactPreviewRows(
    overlayVatTemplate(sheetName, sheetToMatrix(sheet))
  );
}

function readCell(matrix, [row, col]) {
  if (!Array.isArray(matrix)) return null;
  const target = matrix[row];
  if (!target) return null;
  const value = target[col];
  if (value === undefined) return null;
  return value;
}

function toNumberOrNull(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const str = String(raw).trim();
  if (!str) return null;
  if (/^[—-]+$/.test(str)) return null;
  const cleaned = str.replace(/,/g, '').replace(/\s/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function verifyFingerprints(matricesBySheet) {
  const issues = [];
  for (const fp of TEMPLATE_FINGERPRINTS) {
    const matrix = matricesBySheet[fp.sheet];
    if (!matrix) {
      issues.push({ sheet: fp.sheet, reason: 'sheet missing' });
    } else {
      const value = readCell(matrix, fp.cell);
      if (fp.expectedPrefix) {
        if (
          value === null ||
          !String(value).trim().startsWith(fp.expectedPrefix)
        ) {
          issues.push({
            sheet: fp.sheet,
            cell: fp.cell,
            reason: `期望前缀 "${fp.expectedPrefix}"，实际 "${value}"`,
          });
        }
      } else if ('expectedExact' in fp) {
        const numeric = toNumberOrNull(value);
        if (numeric !== fp.expectedExact) {
          issues.push({
            sheet: fp.sheet,
            cell: fp.cell,
            reason: `期望 ${fp.expectedExact}，实际 ${value}`,
          });
        }
      }
    }
  }
  if (issues.length > 0) {
    throw new ParserError('模板指纹校验失败，可能不是预期的增值税申报表模板', {
      issues,
    });
  }
}

function extractMeta(matricesBySheet) {
  const meta = {};
  for (const field of META_FIELDS) {
    const matrix = matricesBySheet[field.sheet];
    let raw = readCell(matrix, field.cell);
    if (typeof field.transform === 'function') {
      raw = field.transform(raw);
    } else if (typeof raw === 'string') {
      raw = raw.trim();
    }
    meta[field.id] = raw;
  }
  return meta;
}

function extractMainLines(matrix) {
  const lines = {};
  for (const def of MAIN_LINES) {
    lines[def.id] = {
      line: def.line,
      label: def.label,
      generalCurrent: toNumberOrNull(
        readCell(matrix, def.columns.generalCurrent)
      ),
      generalYear: toNumberOrNull(readCell(matrix, def.columns.generalYear)),
      refundCurrent: toNumberOrNull(
        readCell(matrix, def.columns.refundCurrent)
      ),
      refundYear: toNumberOrNull(readCell(matrix, def.columns.refundYear)),
    };
  }
  return lines;
}

function extractAppendixTotals(matricesBySheet) {
  const safeNumber = (sheet, cell) => {
    const matrix = matricesBySheet[sheet];
    return toNumberOrNull(readCell(matrix, cell));
  };
  return {
    appendix1: {
      sales: safeNumber(APPENDIX1_TOTAL.sheet, APPENDIX1_TOTAL.totalCell.sales),
      outputTax: safeNumber(
        APPENDIX1_TOTAL.sheet,
        APPENDIX1_TOTAL.totalCell.outputTax
      ),
    },
    appendix2: {
      count: safeNumber(APPENDIX2_TOTAL.sheet, APPENDIX2_TOTAL.totalCell.count),
      amount: safeNumber(
        APPENDIX2_TOTAL.sheet,
        APPENDIX2_TOTAL.totalCell.amount
      ),
      tax: safeNumber(APPENDIX2_TOTAL.sheet, APPENDIX2_TOTAL.totalCell.tax),
    },
    appendix3: {
      deduction: safeNumber(
        APPENDIX3_TOTAL.sheet,
        APPENDIX3_TOTAL.totalCell.deduction
      ),
    },
    appendix4: {
      endingBalance: safeNumber(
        APPENDIX4_TOTAL.sheet,
        APPENDIX4_TOTAL.totalCell.endingBalance
      ),
    },
  };
}

/**
 * 解析 Excel 输入为 VAT 数据模型。
 * @param {ArrayBuffer | File | string | object} input  ArrayBuffer / Blob / base64 / 已解析的 workbook
 * @returns {{ schemaVersion: string, meta: object, lines: object, appendix: object, parsedAt: number }}
 */
export async function parseVatExcel(input) {
  const workbook = await ensureWorkbook(input);

  const matricesBySheet = {};
  for (const name of Object.values(SHEET_NAMES)) {
    if (!workbook.Sheets[name]) {
      throw new ParserError(`缺少必要的工作表："${name}"`, {
        sheetName: name,
      });
    }
    matricesBySheet[name] = sheetToMatrix(workbook.Sheets[name]);
  }

  verifyFingerprints(matricesBySheet);

  const meta = extractMeta(matricesBySheet);
  const lines = extractMainLines(matricesBySheet[SHEET_NAMES.main]);
  const appendix = extractAppendixTotals(matricesBySheet);

  return {
    schemaVersion: SCHEMA_VERSION,
    parsedAt: Date.now(),
    sourceSheets: Object.values(SHEET_NAMES),
    meta,
    lines,
    appendix,
    schema: vatSchema,
  };
}

/**
 * 读取固定模板的全部 Sheet，用于只读预览 Excel 原始表格。
 * @param {ArrayBuffer | File | string | object} input
 * @returns {Promise<{ sheetNames: string[], sheets: Array<{ name: string, rows: unknown[][] }> }>}
 */
export async function parseVatWorkbookPreview(input) {
  const workbook = await ensureWorkbook(input);

  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: buildPreviewRows(name, workbook.Sheets[name]),
  }));

  const requiredMatrices = {};
  for (const name of Object.values(SHEET_NAMES)) {
    if (!workbook.Sheets[name]) {
      throw new ParserError(`缺少必要的工作表："${name}"`, {
        sheetName: name,
      });
    }
    requiredMatrices[name] = sheetToMatrix(workbook.Sheets[name]);
  }
  verifyFingerprints(requiredMatrices);

  return {
    sheetNames: workbook.SheetNames,
    sheets,
  };
}

export default parseVatExcel;
