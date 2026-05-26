/* eslint-disable -- standalone VAT cross-sheet gate script (browser / Node / Automa) */
/**
 * 增值税一般纳税人申报表 — 主表与附列资料跨表一致性校验
 *
 * 面向税务填报助手工作流变量：
 *   - Sheet1: 主表
 *   - Sheet2: 附列资料（一）销售情况明细
 *   - Sheet3: 附列资料（二）进项税额明细
 *   - Sheet4: 附列资料（三）扣除项目明细
 *   - Sheet5: 附列资料（四）税额抵减情况表
 *
 * 默认坐标同时保留「固定模板解析坐标」和当前 vat-workflow-gates 已使用的候选坐标。
 * 若后续电子税务局模板微调，可通过 runCrossSheetGate({ cellMap }) 覆盖。
 */
'use strict';

var GATE_KEY = 'vatCrossSheetGate';
var TOLERANCE = 0.5;

var SHEET_KEYS = ['Sheet1', 'Sheet2', 'Sheet3', 'Sheet4', 'Sheet5'];

var DEFAULT_CELL_MAP = {
  main: {
    outputTax: {
      label: '主表第11栏销项税额',
      cells: [
        { sheet: 'Sheet1', row: 11, col: 18, label: '一般项目本月数' },
        { sheet: 'Sheet1', row: 11, col: 35, label: '即征即退项目本月数' },
      ],
    },
    inputTax: {
      label: '主表第12栏进项税额',
      cells: [
        { sheet: 'Sheet1', row: 12, col: 18, label: '一般项目本月数' },
        { sheet: 'Sheet1', row: 12, col: 35, label: '即征即退项目本月数' },
      ],
    },
    taxableSales: {
      label: '主表第1栏按适用税率计税销售额',
      cells: [
        { sheet: 'Sheet1', row: 1, col: 18, label: '一般项目本月数' },
        { sheet: 'Sheet1', row: 1, col: 35, label: '即征即退项目本月数' },
      ],
    },
    taxReduction: {
      label: '主表第23栏应纳税额减征额',
      cells: [
        { sheet: 'Sheet1', row: 23, col: 18, label: '一般项目本月数' },
        { sheet: 'Sheet1', row: 23, col: 35, label: '即征即退项目本月数' },
      ],
    },
  },
  appendix: {
    appendix1OutputTax: {
      label: '附列资料（一）销项（应纳）税额合计',
      candidates: [
        { sheet: 'Sheet2', row: 13, col: 4, label: '固定模板合计行-销项税额' },
        { sheet: 'Sheet2', row: 13, col: 13, label: '工作流候选-合计税额' },
        { sheet: 'Sheet2', row: 19, col: 17, label: '工作流候选-本表税额合计' },
        { sheet: 'Sheet2', row: 24, col: 17, label: '工作流候选-简易计税税额合计' },
        { sheet: 'Sheet2', row: 28, col: 15, label: '工作流候选-免抵退/免税税额合计' },
      ],
    },
    appendix2InputTax: {
      label: '附列资料（二）申报抵扣进项税额合计',
      candidates: [
        { sheet: 'Sheet3', row: 11, col: 3, label: '固定模板合计行-税额' },
        { sheet: 'Sheet3', row: 18, col: 6, label: '工作流候选-申报抵扣税额合计' },
        { sheet: 'Sheet3', row: 50, col: 6, label: '工作流候选-最终税额合计' },
      ],
    },
    appendix3Deduction: {
      label: '附列资料（三）本期实际扣除金额合计',
      candidates: [
        { sheet: 'Sheet4', row: 5, col: 5, label: '固定模板合计行-本期实际扣除金额' },
        { sheet: 'Sheet4', row: 14, col: 6, label: '工作流候选-扣除金额合计' },
      ],
    },
    appendix4EndingBalance: {
      label: '附列资料（四）税额抵减期末余额',
      candidates: [
        { sheet: 'Sheet5', row: 16, col: 7, label: '固定模板合计行-期末余额' },
        { sheet: 'Sheet5', row: 11, col: 5, label: '工作流候选-期末余额合计' },
      ],
    },
  },
};

function mergeCellMap(base, override) {
  if (!override) return base;
  var next = JSON.parse(JSON.stringify(base));
  Object.keys(override).forEach(function (groupKey) {
    next[groupKey] = next[groupKey] || {};
    Object.keys(override[groupKey] || {}).forEach(function (entryKey) {
      next[groupKey][entryKey] = override[groupKey][entryKey];
    });
  });
  return next;
}

function resolveSheet(sheetKey, options) {
  options = options || {};
  if (options.sheets && options.sheets[sheetKey] != null) return options.sheets[sheetKey];
  if (options[sheetKey] != null) return options[sheetKey];
  if (typeof automaRefData === 'function') {
    try {
      var fromAutoma = automaRefData('variables', sheetKey);
      if (fromAutoma != null) return fromAutoma;
    } catch (e) {
      /* 非 Automa 环境或无该变量 */
    }
  }
  if (typeof globalThis !== 'undefined' && globalThis[sheetKey] != null) {
    return globalThis[sheetKey];
  }
  return null;
}

function resolveSheets(options) {
  var sheets = {};
  for (var i = 0; i < SHEET_KEYS.length; i++) {
    sheets[SHEET_KEYS[i]] = resolveSheet(SHEET_KEYS[i], options);
  }
  return sheets;
}

function getCellValue(sheet, r, c) {
  if (sheet == null || !Array.isArray(sheet)) return undefined;
  var row = sheet[r];
  if (!Array.isArray(row)) return undefined;
  if (c < 0 || c >= row.length) return undefined;
  return row[c];
}

function isBlank(v) {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

function normalizeNumericString(raw) {
  if (typeof raw !== 'string') return raw;
  return raw.trim().replace(/,/g, '').replace(/，/g, '');
}

function toFiniteNumber(v) {
  if (isBlank(v)) return null;
  var s = normalizeNumericString(v);
  if (typeof s === 'string' && /^(—|-|——|--|－－)$/.test(s.trim())) return null;
  var n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

function approxEqual(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

function formatAmount(v) {
  if (v == null) return '(空)';
  return Number(v).toFixed(2);
}

function makeCheckedValueKey(name, sheet, row, col) {
  return name + ' (' + sheet + ' 行' + row + ',列' + col + ')';
}

function readRef(sheets, ref, checkedValues) {
  var raw = getCellValue(sheets[ref.sheet], ref.row, ref.col);
  var key = makeCheckedValueKey(ref.label || ref.sheet, ref.sheet, ref.row, ref.col);
  checkedValues[key] = raw;
  return {
    sheet: ref.sheet,
    row: ref.row,
    col: ref.col,
    label: ref.label || ref.sheet + '[' + ref.row + '][' + ref.col + ']',
    checkedKey: key,
    raw: raw,
    value: toFiniteNumber(raw),
  };
}

function sumCells(sheets, entry, checkedValues) {
  var parts = [];
  var total = 0;
  var found = false;
  for (var i = 0; i < entry.cells.length; i++) {
    var cell = readRef(sheets, entry.cells[i], checkedValues);
    parts.push(cell);
    if (cell.value != null) {
      total += cell.value;
      found = true;
    }
  }
  return {
    label: entry.label,
    value: found ? total : null,
    parts: parts,
    source: found ? 'sum' : 'missing',
  };
}

function firstNumericCandidate(sheets, entry, checkedValues) {
  var candidates = [];
  for (var i = 0; i < entry.candidates.length; i++) {
    var cell = readRef(sheets, entry.candidates[i], checkedValues);
    candidates.push(cell);
    if (cell.value != null) {
      return {
        label: entry.label,
        value: cell.value,
        selected: cell,
        candidates: candidates,
        source: cell.label,
      };
    }
  }
  return {
    label: entry.label,
    value: null,
    selected: null,
    candidates: candidates,
    source: 'missing',
  };
}

function equalityRule(id, severity, left, right, formula) {
  var skipped = left.value == null || right.value == null;
  var ok = skipped || approxEqual(left.value, right.value, TOLERANCE);
  return {
    id: id,
    severity: severity,
    ok: ok,
    skipped: skipped,
    actual: left.value,
    expected: right.value,
    diff: skipped ? null : left.value - right.value,
    formula: formula,
    message: ok
      ? 'ok'
      : left.label +
        ' ' +
        formatAmount(left.value) +
        ' 与 ' +
        right.label +
        ' ' +
        formatAmount(right.value) +
        ' 不一致，差异 ' +
        formatAmount(left.value - right.value),
    detail: { left: left, right: right },
  };
}

function lessOrEqualRule(id, severity, left, right, formula) {
  var skipped = left.value == null || right.value == null || left.value === 0;
  var ok = skipped || left.value <= right.value + TOLERANCE;
  return {
    id: id,
    severity: severity,
    ok: ok,
    skipped: skipped,
    actual: left.value,
    expected: '<= ' + formatAmount(right.value),
    diff: skipped ? null : left.value - right.value,
    formula: formula,
    message: ok
      ? 'ok'
      : left.label + ' ' + formatAmount(left.value) + ' 不应超过 ' + right.label + ' ' + formatAmount(right.value),
    detail: { left: left, right: right },
  };
}

function greaterOrEqualRule(id, severity, left, right, formula) {
  var skipped = left.value == null || right.value == null || right.value === 0;
  var ok = skipped || left.value + TOLERANCE >= right.value;
  return {
    id: id,
    severity: severity,
    ok: ok,
    skipped: skipped,
    actual: left.value,
    expected: '>= ' + formatAmount(right.value),
    diff: skipped ? null : left.value - right.value,
    formula: formula,
    message: ok
      ? 'ok'
      : left.label + ' ' + formatAmount(left.value) + ' 不足以支撑 ' + right.label + ' ' + formatAmount(right.value),
    detail: { left: left, right: right },
  };
}

function logLine(level, msg, detail) {
  var payload = {
    ts: new Date().toISOString(),
    gate: GATE_KEY,
    level: level,
    message: msg,
    detail: detail || null,
  };
  var text = '[vat-gate:' + GATE_KEY + '] ' + msg;
  if (level === 'error') console.error(text, detail || '');
  else console.log(text, detail || '');
  return payload;
}

function publishReport(ok, errors, summary, checkedValues, ruleResults) {
  if (typeof automaSetVariable !== 'function') return;
  try {
    var report = {
      at: new Date().toISOString(),
      gateKey: GATE_KEY,
      ok: ok,
      errors: errors,
      checkedValues: checkedValues,
      summary: summary,
      ruleResults: ruleResults,
    };
    automaSetVariable(GATE_KEY + 'Ok', ok);
    automaSetVariable(GATE_KEY + 'Errors', errors);
    automaSetVariable(GATE_KEY + 'CheckedValues', checkedValues);
    automaSetVariable(GATE_KEY + 'Report', report);
  } catch (e) {
    try {
      automaSetVariable(GATE_KEY + 'PublishError', String(e));
    } catch (e2) {
      /* ignore */
    }
  }
}

function runCrossSheetGate(options) {
  options = options || {};
  var sheets = resolveSheets(options);
  var cellMap = mergeCellMap(DEFAULT_CELL_MAP, options.cellMap);
  var checkedValues = {};
  var logs = [
    logLine('info', '跨表一致性校验开始', {
      tolerance: TOLERANCE,
      sheets: SHEET_KEYS.map(function (key) {
        return { key: key, isArray: Array.isArray(sheets[key]), rowCount: Array.isArray(sheets[key]) ? sheets[key].length : null };
      }),
    }),
  ];

  var mainOutputTax = sumCells(sheets, cellMap.main.outputTax, checkedValues);
  var mainInputTax = sumCells(sheets, cellMap.main.inputTax, checkedValues);
  var mainTaxableSales = sumCells(sheets, cellMap.main.taxableSales, checkedValues);
  var mainTaxReduction = sumCells(sheets, cellMap.main.taxReduction, checkedValues);

  var appendix1OutputTax = firstNumericCandidate(sheets, cellMap.appendix.appendix1OutputTax, checkedValues);
  var appendix2InputTax = firstNumericCandidate(sheets, cellMap.appendix.appendix2InputTax, checkedValues);
  var appendix3Deduction = firstNumericCandidate(sheets, cellMap.appendix.appendix3Deduction, checkedValues);
  var appendix4EndingBalance = firstNumericCandidate(sheets, cellMap.appendix.appendix4EndingBalance, checkedValues);

  var ruleResults = [
    equalityRule(
      'cross.appendix1.outputTax',
      'error',
      appendix1OutputTax,
      mainOutputTax,
      '附列资料（一）销项（应纳）税额合计 = 主表第11栏销项税额',
    ),
    equalityRule(
      'cross.appendix2.inputTax',
      'error',
      appendix2InputTax,
      mainInputTax,
      '附列资料（二）申报抵扣进项税额合计 = 主表第12栏进项税额',
    ),
    lessOrEqualRule(
      'cross.appendix3.deduction',
      'warning',
      appendix3Deduction,
      mainTaxableSales,
      '附列资料（三）扣除项目合计 <= 主表第1栏按适用税率计税销售额',
    ),
    greaterOrEqualRule(
      'cross.appendix4.endingBalance',
      'warning',
      appendix4EndingBalance,
      mainTaxReduction,
      '附列资料（四）期末余额 >= 主表第23栏应纳税额减征额',
    ),
  ];

  var effectiveResults = ruleResults.filter(function (item) {
    return !item.skipped;
  });
  var failedResults = effectiveResults.filter(function (item) {
    return !item.ok;
  });
  var errors = failedResults.map(function (item) {
    return item.id + ' → ' + item.message;
  });
  var ok = errors.length === 0;
  var summary = {
    gate: GATE_KEY,
    tolerance: TOLERANCE,
    总规则数: ruleResults.length,
    实际执行规则数: effectiveResults.length,
    跳过规则数: ruleResults.length - effectiveResults.length,
    通过数: effectiveResults.length - failedResults.length,
    未通过数: failedResults.length,
    整体门禁: ok ? '通过' : '未通过',
  };

  console.log('[vat-gate:' + GATE_KEY + '] 跨表数据来源', {
    mainOutputTax: mainOutputTax,
    mainInputTax: mainInputTax,
    mainTaxableSales: mainTaxableSales,
    mainTaxReduction: mainTaxReduction,
    appendix1OutputTax: appendix1OutputTax,
    appendix2InputTax: appendix2InputTax,
    appendix3Deduction: appendix3Deduction,
    appendix4EndingBalance: appendix4EndingBalance,
  });
  console.log('[vat-gate:' + GATE_KEY + '] 规则明细', ruleResults);
  if (typeof console.table === 'function') {
    console.table(
      ruleResults.map(function (item) {
        return {
          id: item.id,
          ok: item.ok,
          skipped: item.skipped,
          actual: item.actual,
          expected: item.expected,
          formula: item.formula,
          message: item.message,
        };
      }),
    );
  }
  console.log('[vat-gate:' + GATE_KEY + '] 校验汇总', summary);

  if (ok) logs.push(logLine('info', '跨表一致性校验通过', summary));
  else {
    logs.push(logLine('error', '跨表一致性校验未通过', { summary: summary, errors: errors }));
    if (options.alert !== false && typeof alert === 'function') {
      alert('[跨表一致性校验] 数据校验失败\n' + errors.join('\n'));
    }
  }

  publishReport(ok, errors, summary, checkedValues, ruleResults);

  return {
    ok: ok,
    errors: errors,
    checkedValues: checkedValues,
    ruleResults: ruleResults,
    summary: summary,
    logs: logs,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GATE_KEY: GATE_KEY,
    TOLERANCE: TOLERANCE,
    DEFAULT_CELL_MAP: DEFAULT_CELL_MAP,
    runCrossSheetGate: runCrossSheetGate,
    makeCheckedValueKey: makeCheckedValueKey,
  };
}

if (typeof module === 'undefined' || !module.parent) {
  runCrossSheetGate();
}
