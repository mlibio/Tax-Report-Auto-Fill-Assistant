import { objectHasKey } from '@/utils/helper';
import BrowserAPIService from '@/service/browser-api/BrowserAPIService';
import { buildVatCellBusinessContext } from '@/business/tax/adaptive/vatCellBusinessIndex';
import renderString from '../templating/renderString';
import { attachDebugger } from '../helper';

const MUSTACHE_REF_REGEX = /\{\{[^{}]+\}\}/;

function getFormsValueRef(block) {
  if (
    typeof block.data.value === 'string' &&
    MUSTACHE_REF_REGEX.test(block.data.value)
  ) {
    return block.data.value;
  }

  return Object.keys(block.replacedValue || {}).find((key) =>
    MUSTACHE_REF_REGEX.test(key)
  );
}

async function checkAccess(blockName) {
  if (blockName === 'upload-file') {
    const hasFileAccess =
      await BrowserAPIService.extension.isAllowedFileSchemeAccess();

    if (hasFileAccess) return true;

    throw new Error('no-file-access');
  } else if (blockName === 'clipboard') {
    const hasPermission = await BrowserAPIService.permissions.contains({
      permissions: ['clipboardRead'],
    });

    if (!hasPermission) {
      throw new Error('no-clipboard-acces');
    }
  }

  return true;
}

// Forms text-field / select inputs are typed into a real input on the page.
// Leaving an unresolved `{{...}}` literal there is almost never what the user
// wants — for tax filing in particular, an empty cell in the parsed Sheet1
// table just means "the user has nothing to declare in that field" and should
// produce an empty input, not the literal placeholder.
//
// This helper resolves any remaining `{{...}}` against the latest reference
// data, replaces unresolved references with an empty string, and returns a
// structured diagnostic so we can show the user *why* a placeholder could not
// be filled (missing variable, sparse cell, wrong type, ...).
async function resolveFormValue(block, referenceData) {
  const rawValueRef = block.label === 'forms' ? getFormsValueRef(block) : null;
  const hasRawValueRef = Boolean(rawValueRef);
  const hasValueRef =
    typeof block.data.value === 'string' &&
    MUSTACHE_REF_REGEX.test(block.data.value);

  if (block.label !== 'forms' || !hasRawValueRef) {
    return { block, diagnostics: [] };
  }

  const adaptiveDomain = block.data.adaptiveDomain || 'tax-vat';
  const hasAdaptiveConfig =
    block.data.enableAdaptiveMatch ||
    objectHasKey(block.data, 'adaptiveThreshold') ||
    !block.data.selector;
  const adaptiveBusinessContext =
    hasAdaptiveConfig && adaptiveDomain === 'tax-vat'
      ? buildVatCellBusinessContext(rawValueRef, referenceData)
      : null;

  const refData = {
    ...referenceData,
    secrets: {},
  };

  const rendered = hasValueRef
    ? await renderString(block.data.value, refData, {
        defaultUnresolved: '',
      })
    : {
        list: block.replacedValue || {},
        unresolvedRefs: [],
        value: block.data.value || '',
      };

  const diagnostics = (rendered.unresolvedRefs || []).map((diag) => ({
    ...diag,
    // eslint-disable-next-line no-use-before-define
    variableState: describeVariableState(refData, diag.dataKey, diag.path),
  }));

  const replacedValue =
    rendered.list && Object.keys(rendered.list).length > 0
      ? rendered.list
      : null;

  return {
    block: {
      ...block,
      data: {
        ...block.data,
        value: rendered.value || '',
        enableAdaptiveMatch:
          block.data.enableAdaptiveMatch || Boolean(adaptiveBusinessContext),
        adaptiveDomain,
        adaptiveThreshold: block.data.adaptiveThreshold ?? 0.75,
        adaptiveOnlyEmptyControls: block.data.adaptiveOnlyEmptyControls ?? true,
        adaptiveLogDetail: block.data.adaptiveLogDetail ?? true,
        adaptiveBusinessContext,
        adaptiveSourceRef: adaptiveBusinessContext?.sourceRef || null,
      },
    },
    diagnostics,
    replacedValue,
  };
}

// Best-effort summary of what the *root* variable / data namespace currently
// holds, so the diagnostic explains whether the issue was an empty cell, a
// missing variable, or the wrong type altogether.
function describeVariableState(refData, dataKey, path) {
  const namespace = refData ? refData[dataKey] : undefined;
  if (typeof namespace === 'undefined' || namespace === null) {
    return {
      dataKey,
      kind: 'missing',
      message: `数据命名空间 "${dataKey}" 不可用`,
    };
  }

  const rootName = (path || '').split('.')[0];
  if (!rootName) {
    return {
      dataKey,
      kind: typeof namespace,
      message: `${dataKey} 已存在但没有指定具体路径`,
    };
  }

  const root = namespace?.[rootName];
  if (typeof root === 'undefined' || root === null) {
    return {
      dataKey,
      rootName,
      kind: 'missing',
      message: `变量 ${dataKey}.${rootName} 未定义或为空 (是否忘记先用 Insert Data 解析 Excel？)`,
    };
  }
  if (Array.isArray(root)) {
    const firstRow = root[0];
    return {
      dataKey,
      rootName,
      kind: 'array',
      message: `变量 ${dataKey}.${rootName} 是长度 ${root.length} 的数组${
        Array.isArray(firstRow) ? `（每行最多 ${firstRow.length} 列）` : ''
      }`,
    };
  }
  if (typeof root === 'object') {
    return {
      dataKey,
      rootName,
      kind: 'object',
      message: `变量 ${dataKey}.${rootName} 是对象（包含键：${Object.keys(root)
        .slice(0, 8)
        .join(', ')}）`,
    };
  }
  return {
    dataKey,
    rootName,
    kind: typeof root,
    message: `变量 ${dataKey}.${rootName} 是 ${typeof root}，不能按 .行.列 取值`,
  };
}

function logFormDiagnostics(engine, block, diagnostics) {
  if (!diagnostics || diagnostics.length === 0) return;

  const lines = diagnostics.map(
    (diag) =>
      `${diag.match} → ${diag.detail || diag.reason}${
        diag.variableState?.message ? `；${diag.variableState.message}` : ''
      }`
  );

  console.warn(
    `[Forms ${block.id}] 检测到 ${
      diagnostics.length
    } 个未能解析的 {{...}} 引用，已用空字符串填充：\n  - ${lines.join(
      '\n  - '
    )}`
  );

  try {
    engine?.addLogHistory?.({
      type: 'info',
      name: 'forms-unresolved-ref',
      blockId: block.id,
      description: `Forms: ${diagnostics.length} 个 {{...}} 引用未解析（已用空字符串填充）`,
      message: lines.join(' | '),
      timestamp: Date.now(),
      duration: 0,
      ctxData: {
        unresolvedRefs: diagnostics,
      },
    });
  } catch (_) {
    // logging is best-effort; never break the workflow because of it
  }
}

function describeAdaptiveReason(detail) {
  if (!detail) return '';
  switch (detail.reason) {
    case 'missing-business-context':
      return '未能从表单值识别出税务业务字段（请确认值是 {{variables@SheetX.row.col}} 引用且已加载 Excel 数据）';
    case 'no-empty-controls':
      return '页面没有未填写的可编辑控件，已停止以避免覆盖已有值';
    case 'confidence-too-low':
      return `候选控件最高置信度 ${
        detail.highestConfidence ?? 0
      } 低于阈值 ${detail.threshold ?? '?'}`;
    case 'ambiguous-match':
      return `候选控件最高置信度 ${detail.highestConfidence} 与次高 ${detail.secondConfidence} 差距过小，存在歧义`;
    default:
      return detail.reason || '';
  }
}

function buildAdaptiveLogMessage(block, detail) {
  if (!detail) return '';
  const business = detail.businessContext || {};
  const lines = [];
  if (block.data.selector) {
    lines.push(`原 CSS 选择器: "${block.data.selector}" 未匹配到元素`);
  } else {
    lines.push('未配置 CSS 选择器或选择器为空');
  }
  if (business.sourceRef?.raw) {
    lines.push(
      `Excel 坐标: ${business.sourceRef.raw} → ${
        business.cellRef || ''
      } (${business.sheetName || business.sheetAlias || ''})`
    );
  }
  if (business.label) {
    lines.push(`识别业务字段: ${business.label}`);
  }
  if (detail.ok) {
    lines.push(`命中控件: ${detail.selectorUsed}`);
    lines.push(`置信度: ${detail.confidence} (阈值 ${detail.threshold ?? ''})`);
    if (detail.matchedBy && detail.matchedBy.length) {
      lines.push(`匹配依据: ${detail.matchedBy.join(', ')}`);
    }
  } else {
    const reasonDetail = describeAdaptiveReason(detail);
    if (reasonDetail) lines.push(`失败原因: ${reasonDetail}`);
    if (Array.isArray(detail.candidates) && detail.candidates.length) {
      const top = detail.candidates
        .slice(0, 3)
        .map(
          (item, idx) =>
            `  候选 ${idx + 1} 置信度 ${item.score} → ${item.element}`
        )
        .join('\n');
      lines.push(`候选评分:\n${top}`);
    }
  }
  return lines.join('\n');
}

function normalizeAdaptiveNoticeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildAdaptiveFieldName(business) {
  const rowLabelParts = Array.isArray(business.rowLabelParts)
    ? business.rowLabelParts
    : [];
  const columnLabelParts = Array.isArray(business.columnLabelParts)
    ? business.columnLabelParts
    : [];
  const rowLabel = normalizeAdaptiveNoticeText(
    rowLabelParts[rowLabelParts.length - 1] || business.rowLabel
  );
  const columns = columnLabelParts
    .map(normalizeAdaptiveNoticeText)
    .filter(Boolean);

  if (rowLabel || columns.length) {
    return [rowLabel, ...columns].filter(Boolean).join('-');
  }

  return normalizeAdaptiveNoticeText(business.label || business.cellRef);
}

function simplifyAdaptiveSelector(selector) {
  const text = normalizeAdaptiveNoticeText(selector);
  if (!text) return '匹配控件';

  return text.split('[')[0] || text;
}

function buildAdaptiveNoticeMessage(block, detail) {
  const business = detail.businessContext || {};
  const fieldName = buildAdaptiveFieldName(business) || '未识别字段';
  const rowNo = business.lineNo ?? business.rowIndex;
  const colNo = business.columnLineNo ?? business.colIndex;
  const position = [
    rowNo || rowNo === 0 ? `行${rowNo}` : '',
    colNo || colNo === 0 ? `列${colNo}` : '',
  ]
    .filter(Boolean)
    .join(',');
  const value =
    block.data.value === '' || typeof block.data.value === 'undefined'
      ? '空'
      : block.data.value;
  const dataLine = `"${fieldName}${
    position ? ` (${position})` : ''
  }": ${value}`;

  if (detail.ok) {
    return `${dataLine}\n适配结果: 成功，已填报到 ${simplifyAdaptiveSelector(
      detail.selectorUsed
    )}，置信度 ${detail.confidence}。`;
  }

  return `${dataLine}\n适配结果: 未填报，${
    describeAdaptiveReason(detail) || detail.reason || '未找到可靠候选控件'
  }。`;
}

function collectAdaptiveNotice(engine, block, detail, activeTab) {
  if (!engine || !detail) return;

  if (!Array.isArray(engine.taxVatAdaptiveNotices)) {
    engine.taxVatAdaptiveNotices = [];
  }

  engine.taxVatAdaptiveNotices.push(buildAdaptiveNoticeMessage(block, detail));

  if (activeTab?.id || block.activeTabId) {
    engine.taxVatAdaptiveNoticeTarget = {
      tabId: activeTab?.id || block.activeTabId,
      frameId:
        typeof activeTab?.frameId === 'number' ? activeTab.frameId : undefined,
    };
  }
}

function logAdaptiveMatch(engine, block, result) {
  if (!result || !result.__formsAdaptiveMatch) return;

  const detail = result.__formsAdaptiveMatch;
  const business = detail.businessContext || {};
  const status = detail.ok ? 'success' : 'failed';
  const reasonDetail = describeAdaptiveReason(detail);
  const description = detail.ok
    ? `Forms: CSS选择器失败后通过税务页面适配完成填报，置信度 ${detail.confidence}`
    : `Forms: CSS选择器失败后税务页面适配未执行填报（${
        detail.reason
      }），工作流将继续执行${reasonDetail ? ` — ${reasonDetail}` : ''}`;
  const message = buildAdaptiveLogMessage(block, detail) || detail.message || '';

  if (detail.ok) {
    console.info(`[Forms ${block.id}] ${description}\n${message}`);
  } else {
    // surface the full adaptive calculation in devtools so the user can debug
    // why their threshold was not met, even if the workflow log panel only
    // shows a brief description.
    console.warn(`[Forms ${block.id}] ${description}\n${message}`);
  }

  try {
    engine?.addLogHistory?.({
      type: detail.ok ? 'info' : 'warning',
      name: 'forms-adaptive-match',
      blockId: block.id,
      description,
      message,
      timestamp: Date.now(),
      duration: 0,
      // Adaptive matching is a diagnostic workflow feature: users need this
      // calculation even when normal workflow log saving is disabled.
      forceSaveLog: true,
      syncRunningState: true,
      ctxData: {
        status,
        reason: detail.reason,
        reasonDetail,
        originalSelector: block.data.selector,
        sourceRef: business.sourceRef?.raw || block.data.adaptiveSourceRef?.raw,
        sheetAlias: business.sheetAlias,
        sheetName: business.sheetName,
        rowIndex: business.rowIndex,
        colIndex: business.colIndex,
        cellRef: business.cellRef,
        fieldLabel: business.label,
        fieldPath: business.fieldPath,
        fieldValue: block.data.value,
        matchedBy: detail.matchedBy,
        confidence: detail.confidence,
        highestConfidence: detail.highestConfidence,
        secondConfidence: detail.secondConfidence,
        threshold: detail.threshold,
        selectorUsed: detail.selectorUsed,
        evidence: block.data.adaptiveLogDetail ? detail.evidence : undefined,
        candidates: block.data.adaptiveLogDetail
          ? detail.candidates
          : undefined,
      },
    });
  } catch (_) {
    // logging is best-effort; never break the workflow because of it
  }
}

function logAdaptiveDebug(engine, block, error) {
  if (
    block.label !== 'forms' ||
    error.message !== 'element-not-found' ||
    error.data?.adaptiveMatch
  ) {
    return;
  }

  try {
    engine?.addLogHistory?.({
      type: 'warning',
      name: 'forms-adaptive-debug',
      blockId: block.id,
      description: 'Forms: 选择器失败但未进入税务页面适配',
      message:
        '请检查该节点是否有 {{variables@SheetX.row.col}} 值、是否加载了最新 build 目录产物。',
      timestamp: Date.now(),
      duration: 0,
      ctxData: {
        selector: block.data.selector,
        value: block.data.value,
        enableAdaptiveMatch: block.data.enableAdaptiveMatch,
        adaptiveDomain: block.data.adaptiveDomain,
        hasAdaptiveBusinessContext: Boolean(block.data.adaptiveBusinessContext),
        adaptiveSourceRef: block.data.adaptiveSourceRef,
      },
    });
  } catch (_) {
    // logging is best-effort; never break the workflow because of it
  }
}

async function interactionHandler(block) {
  await checkAccess(block.label);

  const debugMode =
    (block.data.settings?.debugMode ?? false) && !this.settings.debugMode;
  const isChrome = BROWSER_TYPE === 'chrome';

  try {
    if (debugMode && isChrome) {
      await attachDebugger(this.activeTab.id);
      block.debugMode = true;
    }

    // Resolve any leftover `{{...}}` references in Forms `value` against the
    // latest reference data and emit diagnostics for anything we still cannot
    // fill in (missing variable, empty cell, wrong type, ...). After this
    // step the value sent to the content script is fully resolved, so the
    // tab no longer needs `refData` for templating fallback.
    const {
      block: resolvedBlock,
      diagnostics,
      replacedValue,
    } = await resolveFormValue(block, this.engine.referenceData);

    if (diagnostics && diagnostics.length) {
      logFormDiagnostics(this.engine, resolvedBlock, diagnostics);
    }

    block = resolvedBlock;

    // We still send `refData` along when something is unusual, so the content
    // side can perform a final fallback resolution. After `resolveFormValue`
    // the value should already be free of `{{...}}` literals, but being
    // defensive here costs nothing and keeps the existing fallback intact.
    const hasUnresolvedValueRef =
      block.label === 'forms' &&
      typeof block.data.value === 'string' &&
      MUSTACHE_REF_REGEX.test(block.data.value);
    const messageBlock = hasUnresolvedValueRef
      ? {
          ...block,
          refData: {
            ...this.engine.referenceData,
            secrets: {},
          },
        }
      : block;

    let data = await this._sendMessageToTab(messageBlock, {
      frameId: this.activeTab.frameId || 0,
    });

    if (block.label === 'forms' && data?.__formsAdaptiveMatch) {
      // Page adaptation actually ran (either successfully filled, or
      // computed candidate scores but stopped to protect the page). In
      // either case the calculation is recorded in the workflow log and we
      // let the workflow keep going — the plan explicitly states all four
      // adaptive failure modes (missing-business-context, no-empty-controls,
      // confidence-too-low, ambiguous-match) should "只记录日志，不填报"
      // rather than terminate the workflow with element-not-found.
      logAdaptiveMatch(this.engine, block, data);
      collectAdaptiveNotice(
        this.engine,
        messageBlock,
        data.__formsAdaptiveMatch,
        this.activeTab
      );
      data = null;
    }

    if (
      (block.data.saveData && block.label !== 'forms') ||
      (block.data.getValue && block.data.saveData)
    ) {
      const currentColumnType =
        this.engine.columns[block.data.dataColumn]?.type || 'any';
      const insertDataToColumn = (value) => {
        this.addDataToColumn(block.data.dataColumn, value);

        const addExtraRow =
          objectHasKey(block.data, 'extraRowDataColumn') &&
          block.data.addExtraRow;
        if (addExtraRow) {
          this.addDataToColumn(
            block.data.extraRowDataColumn,
            block.data.extraRowValue
          );
        }
      };

      if (Array.isArray(data) && currentColumnType !== 'array') {
        data.forEach((value) => {
          insertDataToColumn(value);
        });
      } else {
        insertDataToColumn(data);
      }
    }

    if (block.data.assignVariable) {
      await this.setVariable(block.data.variableName, data);
    }

    if (debugMode && isChrome) {
      BrowserAPIService.debugger.detach({ tabId: this.activeTab.id });
    }

    return {
      data,
      replacedValue,
      nextBlockId: this.getBlockConnections(block.id),
    };
  } catch (error) {
    if (debugMode && isChrome) {
      BrowserAPIService.debugger.detach({ tabId: this.activeTab.id });
    }

    // Adaptive match failures no longer throw — they emit a
    // `forms-adaptive-match` log and let the workflow continue. Reaching the
    // catch path therefore means the forms block failed before adaptation
    // could run (e.g. CSS missed AND adaptive was not enabled, or the tab
    // message itself failed). Emit a debug log so the user can tell those
    // cases apart from a real adaptive-match decision.
    logAdaptiveDebug(this.engine, block, error);

    error.data = {
      ...(error.data || {}),
      name: block.label,
      selector: block.data.selector,
    };

    throw error;
  }
}

export default interactionHandler;
