/* eslint-disable -- standalone VAT business-rule gate script (browser / Node / Automa) */
/**
 * 增值税一般纳税人主表 — 业务计算关系校验
 *
 * 面向税务填报助手工作流变量：
 *   - Sheet1: 主表二维数组，单元格访问方式与现有 gateSheet1-main.js 一致。
 *
 * 主要校验：
 *   - 第17栏 应抵扣税额合计 = 12 + 13 - 14 - 15 + 16
 *   - 第18栏 实际抵扣税额 = min(17, 11)
 *   - 第19栏 应纳税额 = 11 - 18
 *   - 第20栏 期末留抵税额 = 17 - 18
 *   - 第24栏 应纳税额合计 = 19 + 21 - 23
 */
'use strict';

var GATE_KEY = 'sheet1BusinessGate';
var SHEET_KEY = 'Sheet1';
var TOLERANCE = 0.5;

var MAIN_COLUMNS = [
  { key: 'generalCurrent', col: 18, label: '一般项目-本月数' },
  { key: 'refundCurrent', col: 35, label: '即征即退项目-本月数' },
];

var LINE_LABELS = {
  11: '销项税额',
  12: '进项税额',
  13: '上期留抵税额',
  14: '进项税额转出',
  15: '免抵退应退税额',
  16: '按适用税率计算的纳税检查应补缴税额',
  17: '应抵扣税额合计',
  18: '实际抵扣税额',
  19: '应纳税额',
  20: '期末留抵税额',
  21: '简易计税办法计算的应纳税额',
  23: '应纳税额减征额',
  24: '应纳税额合计',
};

function resolveSheet(userSheet) {
  if (userSheet != null) return userSheet;
  if (typeof automaRefData === 'function') {
    try {
      var fromAutoma = automaRefData('variables', SHEET_KEY);
      if (fromAutoma != null) return fromAutoma;
    } catch (e) {
      /* 非 Automa 环境或无该变量 */
    }
  }
  if (typeof globalThis !== 'undefined' && globalThis[SHEET_KEY] != null) {
    return globalThis[SHEET_KEY];
  }
  return null;
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

function amountOrZero(v) {
  return v == null ? 0 : v;
}

function approxEqual(a, b, tolerance) {
  return Math.abs(amountOrZero(a) - amountOrZero(b)) <= tolerance;
}

function formatAmount(v) {
  if (v == null) return '(空)';
  return Number(v).toFixed(2);
}

function makeCheckedValueKey(name, row, col) {
  return name + ' (行' + row + ',列' + col + ')';
}

function readLineCell(sheet, line, colDef) {
  var raw = getCellValue(sheet, line, colDef.col);
  return {
    line: line,
    col: colDef.col,
    columnKey: colDef.key,
    columnLabel: colDef.label,
    label: '第' + line + '栏' + LINE_LABELS[line],
    checkedKey: makeCheckedValueKey(
      colDef.label + '-第' + line + '栏-' + LINE_LABELS[line],
      line,
      colDef.col,
    ),
    raw: raw,
    value: toFiniteNumber(raw),
  };
}

function makeReader(sheet, colDef, checkedValues) {
  return function read(line) {
    var cell = readLineCell(sheet, line, colDef);
    checkedValues[cell.checkedKey] = cell.raw;
    return cell;
  };
}

function hasAnyNumeric(cells) {
  for (var i = 0; i < cells.length; i++) {
    if (cells[i].value != null) return true;
  }
  return false;
}

function buildResult(rule, colDef, actual, deps, expected) {
  var shouldCheck = actual.value != null || hasAnyNumeric(deps);
  var ok = !shouldCheck || (actual.value != null && approxEqual(actual.value, expected, TOLERANCE));
  var diff = actual.value == null ? null : actual.value - expected;
  return {
    id: rule.id + '.' + colDef.key,
    severity: rule.severity,
    ok: ok,
    skipped: !shouldCheck,
    column: colDef.label,
    checkedKey: actual.checkedKey,
    actual: actual.value,
    expected: expected,
    diff: diff,
    formula: rule.formula,
    message: ok
      ? 'ok'
      : actual.label +
        '（' +
        colDef.label +
        '）应等于 ' +
        rule.formula +
        '，实际 ' +
        formatAmount(actual.value) +
        '，期望 ' +
        formatAmount(expected) +
        '，差异 ' +
        formatAmount(diff),
    detail: {
      actualCell: { row: actual.line, col: actual.col, value: actual.raw },
      dependencyCells: deps.map(function (dep) {
        return {
          line: dep.line,
          label: dep.label,
          row: dep.line,
          col: dep.col,
          value: dep.raw,
          parsed: dep.value,
        };
      }),
    },
  };
}

var FORMULA_RULES = [
  {
    id: 'business.line17.formula',
    severity: 'error',
    actualLine: 17,
    deps: [12, 13, 14, 15, 16],
    formula: '12 + 13 - 14 - 15 + 16',
    expected: function (v) {
      return amountOrZero(v[12]) + amountOrZero(v[13]) - amountOrZero(v[14]) - amountOrZero(v[15]) + amountOrZero(v[16]);
    },
  },
  {
    id: 'business.line18.minRule',
    severity: 'error',
    actualLine: 18,
    deps: [17, 11],
    formula: 'min(17, 11)',
    expected: function (v) {
      return Math.min(amountOrZero(v[17]), amountOrZero(v[11]));
    },
  },
  {
    id: 'business.line19.formula',
    severity: 'error',
    actualLine: 19,
    deps: [11, 18],
    formula: '11 - 18',
    expected: function (v) {
      return amountOrZero(v[11]) - amountOrZero(v[18]);
    },
  },
  {
    id: 'business.line20.formula',
    severity: 'error',
    actualLine: 20,
    deps: [17, 18],
    formula: '17 - 18',
    expected: function (v) {
      return amountOrZero(v[17]) - amountOrZero(v[18]);
    },
  },
  {
    id: 'business.line24.formula',
    severity: 'error',
    actualLine: 24,
    deps: [19, 21, 23],
    formula: '19 + 21 - 23',
    expected: function (v) {
      return amountOrZero(v[19]) + amountOrZero(v[21]) - amountOrZero(v[23]);
    },
  },
];

function runFormulaRule(rule, sheet, colDef, checkedValues) {
  var read = makeReader(sheet, colDef, checkedValues);
  var actual = read(rule.actualLine);
  var deps = rule.deps.map(read);
  var values = {};
  for (var i = 0; i < deps.length; i++) values[deps[i].line] = deps[i].value;
  var expected = rule.expected(values);
  return buildResult(rule, colDef, actual, deps, expected);
}

function runInvariantRules(sheet, colDef, checkedValues) {
  var read = makeReader(sheet, colDef, checkedValues);
  var v11 = read(11);
  var v17 = read(17);
  var v18 = read(18);
  var v19 = read(19);
  var v20 = read(20);
  var results = [];

  if (hasAnyNumeric([v11, v17, v18])) {
    var upper = Math.min(amountOrZero(v11.value), amountOrZero(v17.value));
    var ok18 = v18.value != null && v18.value <= upper + TOLERANCE;
    results.push({
      id: 'business.line18.upperBound.' + colDef.key,
      severity: 'error',
      ok: ok18,
      skipped: false,
      column: colDef.label,
      checkedKey: v18.checkedKey,
      actual: v18.value,
      expected: upper,
      formula: '18 <= min(11, 17)',
      message: ok18
        ? 'ok'
        : v18.label + '（' + colDef.label + '）不能大于销项税额和应抵扣税额合计的较小值',
    });
  }

  if (hasAnyNumeric([v19, v20])) {
    var bothPositive = amountOrZero(v19.value) > TOLERANCE && amountOrZero(v20.value) > TOLERANCE;
    results.push({
      id: 'business.line19Line20.mutualExclusive.' + colDef.key,
      severity: 'warning',
      ok: !bothPositive,
      skipped: false,
      column: colDef.label,
      checkedKey: v19.checkedKey + ' / ' + v20.checkedKey,
      actual: { line19: v19.value, line20: v20.value },
      expected: '第19栏与第20栏通常不应同时为正数',
      formula: 'not(line19 > 0 && line20 > 0)',
      message: bothPositive
        ? '第19栏应纳税额与第20栏期末留抵税额同时为正，请核对实际抵扣税额'
        : 'ok',
    });
  }

  return results;
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

function runMainBusinessGate(options) {
  options = options || {};
  var sheet = resolveSheet(options.sheet);
  var checkedValues = {};
  var ruleResults = [];
  var logs = [
    logLine('info', '主表业务计算关系校验开始', {
      sheetKey: SHEET_KEY,
      tolerance: TOLERANCE,
      isArray: Array.isArray(sheet),
      rowCount: Array.isArray(sheet) ? sheet.length : null,
    }),
  ];

  for (var c = 0; c < MAIN_COLUMNS.length; c++) {
    var colDef = MAIN_COLUMNS[c];
    for (var r = 0; r < FORMULA_RULES.length; r++) {
      ruleResults.push(runFormulaRule(FORMULA_RULES[r], sheet, colDef, checkedValues));
    }
    ruleResults = ruleResults.concat(runInvariantRules(sheet, colDef, checkedValues));
  }

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

  console.log('[vat-gate:' + GATE_KEY + '] 规则明细', ruleResults);
  if (typeof console.table === 'function') {
    console.table(
      ruleResults.map(function (item) {
        return {
          id: item.id,
          column: item.column,
          ok: item.ok,
          skipped: item.skipped,
          actual: typeof item.actual === 'object' ? JSON.stringify(item.actual) : item.actual,
          expected: item.expected,
          formula: item.formula,
        };
      }),
    );
  }
  console.log('[vat-gate:' + GATE_KEY + '] 校验汇总', summary);

  if (ok) logs.push(logLine('info', '主表业务计算关系校验通过', summary));
  else {
    logs.push(logLine('error', '主表业务计算关系校验未通过', { summary: summary, errors: errors }));
    if (options.alert !== false && typeof alert === 'function') {
      alert('[主表业务校验] 数据校验失败\n' + errors.join('\n'));
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
    SHEET_KEY: SHEET_KEY,
    TOLERANCE: TOLERANCE,
    MAIN_COLUMNS: MAIN_COLUMNS,
    FORMULA_RULES: FORMULA_RULES,
    runMainBusinessGate: runMainBusinessGate,
    makeCheckedValueKey: makeCheckedValueKey,
  };
}

if (typeof module === 'undefined' || !module.parent) {
  runMainBusinessGate();
}
