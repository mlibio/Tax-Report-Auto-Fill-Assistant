/* eslint-disable -- standalone VAT gate script (browser / Node / Automa) */
/**
 * 增值税附列资料（三）— 数据校验与执行门禁
 * 对应工作流「税务申报-附列资料3」中引用的 variables@Sheet4.r.c
 * checkedValues 键：「业务名 (行r,列c)」→ 单元格原始值（与主表 gateSheet1 一致）
 */
'use strict';

var SHEET_KEY = 'Sheet4';

var HUMAN_SHEET = '附列资料三';

function makeCheckedValueKey(name, row, col) {
  return name + ' (行' + row + ',列' + col + ')';
}

var POINT_COORDS = [
  [7, 2], [7, 4], [7, 6], [8, 2], [8, 4], [8, 6], [9, 2], [9, 4], [9, 6], [10, 2], [10, 4], [10, 6], [11, 2], [11, 4], [11, 6],
  [12, 2], [12, 4], [12, 6], [13, 2], [13, 4], [13, 6], [14, 2], [14, 4], [14, 6],
];

var POINTS = POINT_COORDS.map(function (pair) {
  var r = pair[0];
  var c = pair[1];
  return { row: r, col: c, name: HUMAN_SHEET + '·行' + r + '·列' + c };
});

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
  if (typeof globalThis !== 'undefined' && globalThis[SHEET_KEY] != null) return globalThis[SHEET_KEY];
  return null;
}

function getCellValue(sheet, r, c) {
  if (sheet == null || !Array.isArray(sheet)) return undefined;
  var row = sheet[r];
  if (!Array.isArray(row)) return undefined;
  if (c < 0 || c >= row.length) return undefined;
  return row[c];
}

function isPlaceholder(v) {
  if (v == null) return false;
  var s = String(v).trim();
  return s === '——' || s === '—' || s === '--' || s === '－－';
}

function isBlank(v) {
  if (v == null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

function normalizeNumericString(raw) {
  if (typeof raw !== 'string') return raw;
  var t = raw.trim().replace(/,/g, '').replace(/，/g, '');
  return t;
}

function toFiniteNumber(v) {
  var n = Number(normalizeNumericString(v));
  if (!Number.isFinite(n)) return null;
  return n;
}

function logLine(level, msg, detail) {
  var payload = {
    ts: new Date().toISOString(),
    gate: SHEET_KEY,
    level: level,
    message: msg,
    detail: detail || null,
  };
  var text = '[vat-gate:' + SHEET_KEY + '] ' + msg;
  if (level === 'error') console.error(text, detail || '');
  else console.log(text, detail || '');
  return payload;
}

/** 不论整表是否有校验错误，均在控制台输出全量基础信息：每项取值、各规则校验结果、扁平摘要 */
function emitVatGateItemBasics(sheetKey, itemResults) {
  console.log(
    '[vat-gate:' + sheetKey + '] ━━━ 基础信息（必打·全量）━━━ 各数据项取值与对应校验结果',
  );
  if (typeof console.groupCollapsed === 'function') {
    console.groupCollapsed('[vat-gate:' + sheetKey + '] 逐项明细（点击展开）');
    for (var bi = 0; bi < itemResults.length; bi++) {
      var it = itemResults[bi];
      var payload = {
        数据项值: it.value === undefined ? '(undefined/未取到)' : it.value,
        本项校验是否通过: it.ok,
        各校验项结果: it.results,
      };
      if (it.checkedKey != null) payload.checkedKey = it.checkedKey;
      if (it.parsedNumber != null) payload.解析数值 = it.parsedNumber;
      if (it.kind != null) payload.栏类型 = it.kind;
      console.log('[' + bi + '] ' + (it.checkedKey || it.ref), payload);
    }
    console.groupEnd();
  } else {
    for (var bj = 0; bj < itemResults.length; bj++) {
      var itj = itemResults[bj];
      var pl = {
        数据项值: itj.value === undefined ? '(undefined/未取到)' : itj.value,
        本项校验是否通过: itj.ok,
        各校验项结果: itj.results,
      };
      if (itj.checkedKey != null) pl.checkedKey = itj.checkedKey;
      if (itj.parsedNumber != null) pl.解析数值 = itj.parsedNumber;
      if (itj.kind != null) pl.栏类型 = itj.kind;
      console.log('[vat-gate:' + sheetKey + '] ' + (itj.checkedKey || itj.ref), pl);
    }
  }
  var flat = [];
  for (var bk = 0; bk < itemResults.length; bk++) {
    var it3 = itemResults[bk];
    var line = {
      checkedKey: it3.checkedKey || it3.ref,
      数据项值: it3.value === undefined ? '(undefined/未取到)' : it3.value,
      本项是否通过: it3.ok,
    };
    if (it3.kind != null) line.栏类型 = it3.kind;
    line.各校验项一行摘要 = it3.results
      .map(function (r) {
        return r.check + '(' + (r.ok ? 'OK' : 'FAIL') + ')';
      })
      .join('; ');
    line.未通过说明 =
      it3.results
        .filter(function (r) {
          return !r.ok;
        })
        .map(function (r) {
          return r.check + ': ' + r.msg;
        })
        .join(' | ') || '(无)';
    flat.push(line);
  }
  console.log('[vat-gate:' + sheetKey + '] 基础信息 · 扁平摘要（便于检索复制）', flat);
  return flat;
}

/** 写入工作流变量，便于在「日志」面板查看（与浏览器 console 分离） */
function automaPublishFullGateReport(sheetKey, ok, errors, summary, checkedValues) {
  if (typeof automaSetVariable !== 'function') return;
  var ap = sheetKey.replace(/^Sheet/, 'sheet');
  try {
    var report = {
      at: new Date().toISOString(),
      sheetKey: sheetKey,
      ok: ok,
      errors: errors,
      checkedValues: checkedValues,
      summary: summary,
    };
    automaSetVariable(ap + 'GateOk', ok);
    automaSetVariable(ap + 'GateErrors', errors);
    automaSetVariable(ap + 'GateCheckedValues', checkedValues);
    automaSetVariable(ap + 'GateReport', report);
  } catch (e) {
    try {
      automaSetVariable(ap + 'GatePublishError', String(e));
    } catch (e2) {
      /* ignore */
    }
  }
}

function runSheet4Gate(options) {
  options = options || {};
  var sheet = resolveSheet(options.sheet);
  var errors = [];
  var checked = {};
  var checkedValues = {};
  var itemResults = [];
  var logs = [
    logLine('info', '门禁开始', {
      points: POINTS.length,
      mode: '仅内容校验',
      dataVariable: SHEET_KEY,
      readViaAutomaRefData: typeof automaRefData === 'function',
      isArray: Array.isArray(sheet),
      rowCount: Array.isArray(sheet) ? sheet.length : null,
    }),
  ];

  for (var i = 0; i < POINTS.length; i++) {
    var def = POINTS[i];
    var r = def.row;
    var c = def.col;
    var displayName = def.name;
    var key = 'r' + r + 'c' + c;
    var cell = getCellValue(sheet, r, c);
    checked[key] = cell;

    var checkedKey = makeCheckedValueKey(displayName, r, c);
    checkedValues[checkedKey] = cell;

    var ref = SHEET_KEY + '[' + r + '][' + c + ']';
    var item = {
      ref: ref,
      checkedKey: checkedKey,
      displayName: displayName,
      row: r,
      col: c,
      value: cell,
      parsedNumber: null,
      results: [],
    };

    if (isBlank(cell)) {
      item.results.push({ check: '非空', ok: false, msg: '空值或未解析到该格' });
    } else {
      item.results.push({ check: '非空', ok: true, msg: 'ok' });
      if (isPlaceholder(cell)) {
        item.results.push({ check: '非占位符', ok: false, msg: '版式占位符（如 ——）' });
      } else {
        item.results.push({ check: '非占位符', ok: true, msg: 'ok' });
        var num = toFiniteNumber(cell);
        item.parsedNumber = num;
        if (num === null) {
          item.results.push({ check: '有效数值', ok: false, msg: '无法解析为有限数值' });
        } else {
          item.results.push({ check: '有效数值', ok: true, msg: 'ok', normalized: num });
        }
      }
    }

    item.ok = item.results.every(function (x) {
      return x.ok;
    });
    if (!item.ok) {
      var failed = item.results
        .filter(function (x) {
          return !x.ok;
        })
        .map(function (x) {
          return x.check + ': ' + x.msg;
        });
      errors.push(checkedKey + ' → ' + failed.join('; '));
    }
    itemResults.push(item);
  }

  var basicsFlat = emitVatGateItemBasics(SHEET_KEY, itemResults);

  var passed = itemResults.filter(function (x) {
    return x.ok;
  }).length;
  var summary = {
    gate: SHEET_KEY,
    总项数: itemResults.length,
    通过数: passed,
    未通过数: itemResults.length - passed,
    整表门禁: null,
  };

  var ok = errors.length === 0;
  summary.整表门禁 = ok ? '通过' : '未通过';
  console.log('[vat-gate:' + SHEET_KEY + '] ═══ 校验汇总 ═══', summary);
  console.log('[vat-gate:' + SHEET_KEY + '] checkedValues（与示例同结构）', checkedValues);
  console.log('[vat-gate:' + SHEET_KEY + '] ━━━ 校验结论快照 ━━━', {
    整表是否通过: ok,
    错误条数: errors.length,
    错误列表: errors.slice(),
    汇总: summary,
    checkedValues: checkedValues,
    全量逐项对象: itemResults,
  });
  if (typeof console.table === 'function') {
    console.table(
      itemResults.map(function (it) {
        return {
          checkedKey: it.checkedKey,
          value: it.value === undefined ? '(undefined)' : it.value,
          ok: it.ok,
          failReasons: it.results
            .filter(function (x) {
              return !x.ok;
            })
            .map(function (x) {
              return x.check + ':' + x.msg;
            })
            .join(' | '),
        };
      }),
    );
  }

  if (ok) logs.push(logLine('info', '门禁通过', summary));
  else {
    logs.push(logLine('error', '门禁未通过', { summary: summary, errors: errors.slice() }));
    if (options.alert !== false && typeof alert === 'function') {
      alert('[' + SHEET_KEY + '] 数据校验失败\n' + errors.join('\n'));
    }
  }

  automaPublishFullGateReport(SHEET_KEY, ok, errors, summary, checkedValues);

  return {
    ok: ok,
    errors: errors,
    checked: checked,
    checkedValues: checkedValues,
    itemResults: itemResults,
    basicsFlat: basicsFlat,
    logs: logs,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SHEET_KEY: SHEET_KEY,
    POINT_COORDS: POINT_COORDS,
    POINTS: POINTS,
    runSheet4Gate: runSheet4Gate,
    makeCheckedValueKey: makeCheckedValueKey,
  };
}

if (typeof module === 'undefined' || !module.parent) {
  runSheet4Gate();
}
