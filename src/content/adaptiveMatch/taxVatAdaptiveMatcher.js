function normalizeText(value) {
  if (value === null || typeof value === 'undefined') return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function compactText(...values) {
  return values.map(normalizeText).filter(Boolean).join(' ');
}

const COLUMN_SEMANTIC_TERMS = [
  '一般项目',
  '即征即退项目',
  '开具增值税专用发票',
  '开具税控增值税专用发票',
  '增值税专用发票',
  '开具其他发票',
  '未开具发票',
  '纳税检查调整',
  '本月数',
  '本年累计',
  '销售额',
  '税额',
  '销项税额',
  '销项(应纳)税额',
  '销项（应纳）税额',
  '应纳税额',
  '进项税额',
  '份数',
  '金额',
  '税率',
  '计税依据',
  '减免税额',
  '抵免金额',
  '扣除项目',
  '期初余额',
  '本期发生额',
  '本期应扣除金额',
  '本期实际扣除金额',
  '本期应抵减税额',
  '本期实际抵减税额',
  '本期可抵减额',
  '期末余额',
];

const COLUMN_HEADER_LOOKBACK_ROWS = 23;
const COLUMN_HEADER_TOP_ROWS = 6;

const APPENDIX1_COLUMN_ATTR_HINTS = {
  12: ['ysfwkcxmbqsjkcje'],
  14: ['kchXxynse'],
};

function isZeroDefaultValue(value) {
  return /^0(?:\.0+)?$/.test(normalizeText(value));
}

function isVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    Number(style.opacity) === 0
  ) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isEditable(element) {
  if (!element || element.disabled || element.readOnly) return false;
  if (element.matches?.('[contenteditable="true"]')) return true;
  const tagName = element.tagName?.toLowerCase();
  if (tagName === 'textarea' || tagName === 'select') return true;
  if (tagName !== 'input') return false;
  const type = (element.getAttribute('type') || 'text').toLowerCase();
  return !['button', 'submit', 'reset', 'hidden', 'file', 'image'].includes(
    type
  );
}

function hasFilledValue(element) {
  const tagName = element.tagName?.toLowerCase();
  if (element.matches?.('[contenteditable="true"]')) {
    const value = normalizeText(element.textContent);
    return value !== '' && !isZeroDefaultValue(value);
  }
  if (tagName === 'select') {
    const value = normalizeText(element.value);
    if (!value) return false;
    const option = element.options?.[element.selectedIndex];
    const optionText = normalizeText(option?.textContent);
    return !/请选择|选择|select|please/i.test(optionText);
  }
  if (tagName === 'input') {
    const type = (element.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') return element.checked;
  }

  const value = normalizeText(element.value);
  return value !== '' && !isZeroDefaultValue(value);
}

function controlTypeMatches(element, data) {
  const tagName = element.tagName?.toLowerCase();
  if (data.type === 'select') return tagName === 'select';
  if (data.type === 'checkbox' || data.type === 'radio') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    return tagName === 'input' && type === data.type;
  }
  if (element.matches?.('[contenteditable="true"]')) return true;
  if (tagName === 'textarea') return true;
  if (tagName !== 'input') return false;
  const type = (element.getAttribute('type') || 'text').toLowerCase();
  return ['text', 'number', 'search', 'tel', ''].includes(type);
}

function scanEmptyControls(root, data) {
  const controls = Array.from(
    root.querySelectorAll('input, textarea, select, [contenteditable="true"]')
  ).filter((element) => {
    if (!isVisible(element) || !isEditable(element)) return false;
    if (!controlTypeMatches(element, data)) return false;
    return !hasFilledValue(element);
  });

  return controls;
}

function getLabelText(element) {
  const id = element.getAttribute('id');
  const labels = [];
  if (id) {
    const escapedId =
      typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
    const documentCtx = element.ownerDocument || document;
    labels.push(
      ...Array.from(
        documentCtx.querySelectorAll(`label[for="${escapedId}"]`)
      ).map((label) => label.textContent)
    );
  }
  const parentLabel = element.closest('label');
  if (parentLabel) labels.push(parentLabel.textContent);
  return compactText(...labels);
}

function getSiblingText(element) {
  const texts = [];
  let prev = element.previousElementSibling;
  let next = element.nextElementSibling;
  for (let i = 0; i < 3; i += 1) {
    if (prev) {
      texts.push(prev.textContent);
      prev = prev.previousElementSibling;
    }
    if (next) {
      texts.push(next.textContent);
      next = next.nextElementSibling;
    }
  }
  return compactText(...texts);
}

function getSpanSize(cell, attr) {
  const value = Number(cell.getAttribute(attr) || 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function buildTableGrid(table) {
  const grid = [];
  const rows = Array.from(table.rows || []);

  rows.forEach((row, rowIndex) => {
    grid[rowIndex] = grid[rowIndex] || [];

    let colIndex = 0;
    Array.from(row.cells || []).forEach((cell) => {
      while (grid[rowIndex][colIndex]) colIndex += 1;

      const colspan = getSpanSize(cell, 'colspan');
      const rowspan = getSpanSize(cell, 'rowspan');

      for (let r = 0; r < rowspan; r += 1) {
        const targetRowIndex = rowIndex + r;
        grid[targetRowIndex] = grid[targetRowIndex] || [];

        for (let c = 0; c < colspan; c += 1) {
          grid[targetRowIndex][colIndex + c] = cell;
        }
      }

      colIndex += colspan;
    });
  });

  return { grid, rows };
}

function getCellVisualPosition(table, row, cell) {
  const { grid, rows } = buildTableGrid(table);
  const rowIndex = rows.indexOf(row);
  const cellIndex = grid[rowIndex]?.indexOf(cell) ?? -1;

  return { grid, rowIndex, cellIndex };
}

function getAncestorTables(element) {
  const tables = [];
  let current = element;

  while (current) {
    if (current.tagName?.toLowerCase() === 'table') tables.push(current);
    current = current.parentElement;
  }

  return tables;
}

function getCellInTable(element, table) {
  let current = element;

  while (current) {
    const cell = current.closest?.('td, th');
    if (!cell) return null;

    const row = cell.parentElement;
    if (row && Array.from(table.rows || []).includes(row)) return cell;

    current = row;
  }

  return null;
}

function collectColumnHeadersFromTable(table, element, options = {}) {
  const cell = getCellInTable(element, table);
  const row = cell?.parentElement;
  if (!cell || !row) return [];

  const headers = [];
  const { grid, rowIndex, cellIndex } = getCellVisualPosition(table, row, cell);
  if (rowIndex < 0 || cellIndex < 0) return headers;

  if (options.includeTopHeaders) {
    for (let r = 0; r < Math.min(rowIndex, COLUMN_HEADER_TOP_ROWS); r += 1) {
      const headerCell = grid[r]?.[cellIndex];
      const text = normalizeText(headerCell?.textContent);
      if (headerCell && headerCell !== cell && text) {
        headers.push(text);
      }
    }
  }

  for (
    let r = Math.max(0, rowIndex - COLUMN_HEADER_LOOKBACK_ROWS);
    r < rowIndex;
    r += 1
  ) {
    const headerCell = grid[r]?.[cellIndex];
    const text = normalizeText(headerCell?.textContent);
    if (headerCell && headerCell !== cell && text) {
      headers.push(text);
    }
  }

  return headers;
}

function getColumnHeaderText(element, options = {}) {
  const headers = [];
  const tables = getAncestorTables(element);

  for (const table of tables) {
    headers.push(...collectColumnHeadersFromTable(table, element, options));
  }

  if (headers.length) return compactText(...Array.from(new Set(headers)));

  const cell = element.closest('td, th');
  const row = element.closest('tr');
  if (!cell || !row) return '';

  const cells = Array.from(row.children);
  const fallbackCellIndex = cells.indexOf(cell);
  if (fallbackCellIndex < 0) return '';

  let current = row.previousElementSibling;
  for (let i = 0; current && i < COLUMN_HEADER_LOOKBACK_ROWS; i += 1) {
    const headerCell = current.children?.[fallbackCellIndex];
    if (headerCell) headers.push(headerCell.textContent);
    current = current.previousElementSibling;
  }
  return compactText(...headers.reverse());
}

function shouldIncludeTopHeaders(businessContext) {
  return businessContext?.sheetAlias === 'Sheet2';
}

function isExplicitLineNoText(text, lineNo) {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  const escapedLineNo = `${lineNo}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactPatterns = [
    new RegExp(`^${escapedLineNo}$`),
    new RegExp(`^第\\s*${escapedLineNo}\\s*栏$`),
    new RegExp(`^${escapedLineNo}\\s*栏$`),
    new RegExp(`^行次\\s*[:：]?\\s*${escapedLineNo}$`),
    new RegExp(`^栏次\\s*[:：]?\\s*${escapedLineNo}$`),
  ];

  if (exactPatterns.some((pattern) => pattern.test(normalized))) return true;

  return (
    new RegExp(`(?:第\\s*${escapedLineNo}\\s*栏)`).test(normalized) ||
    new RegExp(`(?:栏次|行次)\\s*[:：]?\\s*${escapedLineNo}(?!\\d)`).test(
      normalized
    )
  );
}

function hasLineNoInRow(element, lineNo) {
  const row = element.closest('tr');
  if (!row || !lineNo) return false;

  return Array.from(row.cells || []).some((cell) =>
    isExplicitLineNoText(cell.textContent, lineNo)
  );
}

function buildControlContext(element, businessContext) {
  const row = element.closest('tr');
  const container = element.closest(
    'td, th, .form-item, .el-form-item, .ant-form-item'
  );
  const attrs = compactText(
    element.getAttribute('aria-label'),
    element.getAttribute('placeholder'),
    element.getAttribute('title'),
    element.getAttribute('name'),
    element.getAttribute('id')
  );

  return {
    labelText: getLabelText(element),
    attrText: attrs,
    rowText: normalizeText(row?.textContent),
    columnText: getColumnHeaderText(element, {
      includeTopHeaders: shouldIncludeTopHeaders(businessContext),
    }),
    siblingText: getSiblingText(element),
    containerText: normalizeText(container?.textContent),
  };
}

function includesText(haystack, needle) {
  const a = normalizeText(haystack).toLowerCase();
  const b = normalizeText(needle).toLowerCase();
  return Boolean(a && b && a.includes(b));
}

function pushEvidence(evidence, code, weight, message) {
  evidence.push({ code, weight, message });
}

function getColumnSemanticHits(excelColumnText, pageColumnText) {
  const excelText = normalizeText(excelColumnText);
  const pageText = normalizeText(pageColumnText);
  if (!excelText || !pageText) return [];

  return COLUMN_SEMANTIC_TERMS.filter(
    (term) => excelText.includes(term) && pageText.includes(term)
  );
}

function getColumnAttrHintHit(attrText, businessContext) {
  if (businessContext?.sheetAlias !== 'Sheet2') return '';

  const hints = APPENDIX1_COLUMN_ATTR_HINTS[businessContext.columnLineNo];
  if (!hints?.length) return '';

  const normalizedAttrText = normalizeText(attrText).toLowerCase();
  return hints.find((hint) => normalizedAttrText.includes(hint.toLowerCase()));
}

function getRowLabelHit(rowText, businessContext) {
  const rowCandidates = [
    businessContext.rowLabel,
    ...(businessContext.rowLabelParts || []),
    businessContext.label,
  ].filter(Boolean);

  return rowCandidates.find((candidate) => includesText(rowText, candidate));
}

function scoreControl(element, context, businessContext, data) {
  const evidence = [];
  let score = 0;
  const columnText = businessContext.columnText || businessContext.columnLabel;
  const allNearbyText = compactText(
    context.labelText,
    context.attrText,
    context.rowText,
    context.columnText,
    context.siblingText,
    context.containerText
  );

  const rowLabelHit = getRowLabelHit(context.rowText, businessContext);
  if (rowLabelHit) {
    score += 0.2;
    pushEvidence(
      evidence,
      'label-row',
      0.2,
      `页面同行出现字段 ${rowLabelHit}`
    );
  }

  if (columnText && includesText(allNearbyText, columnText)) {
    score += 0.2;
    pushEvidence(
      evidence,
      'column-nearby',
      0.2,
      `附近文本包含 Excel 列语义 ${columnText}`
    );
  }

  const columnSemanticHits = getColumnSemanticHits(
    columnText,
    context.columnText
  );
  if (columnSemanticHits.length >= 2) {
    score += 0.2;
    pushEvidence(
      evidence,
      'column-header',
      0.2,
      `页面列头匹配 Excel 列语义 ${columnSemanticHits.join('、')}`
    );
  }

  const columnAttrHintHit = getColumnAttrHintHit(
    context.attrText,
    businessContext
  );
  if (columnAttrHintHit) {
    score += 0.2;
    pushEvidence(
      evidence,
      'column-attr',
      0.2,
      `页面控件属性匹配附列资料一第${businessContext.columnLineNo}列 ${columnAttrHintHit}`
    );
  }

  const { lineNo } = businessContext;
  if (hasLineNoInRow(element, lineNo)) {
    score += 0.3;
    pushEvidence(evidence, 'line-number', 0.3, `页面同行出现第${lineNo}栏`);
  }

  const keywordHit = (businessContext.keywords || []).find(
    (keyword) => keyword && includesText(allNearbyText, keyword)
  );
  if (keywordHit) {
    score += 0.1;
    pushEvidence(
      evidence,
      'keyword',
      0.1,
      `页面上下文命中关键词 ${keywordHit}`
    );
  }

  return {
    element,
    score: Math.min(1, Number(score.toFixed(3))),
    evidence,
    context,
  };
}

function describeElement(element) {
  const tag = element.tagName?.toLowerCase() || 'element';
  const id = element.id ? `#${element.id}` : '';
  const name = element.getAttribute('name')
    ? `[name="${element.getAttribute('name')}"]`
    : '';
  const type = element.getAttribute('type')
    ? `[type="${element.getAttribute('type')}"]`
    : '';
  return `${tag}${id}${name}${type}`;
}

export function findAdaptiveTaxVatControl(documentCtx, data) {
  const businessContext = data.adaptiveBusinessContext;
  if (!businessContext) {
    return {
      ok: false,
      reason: 'missing-business-context',
      message: '页面适配已启用，但未能从表单值解析出税务业务字段。',
    };
  }

  const controls = scanEmptyControls(documentCtx, data);
  if (!controls.length) {
    return {
      ok: false,
      reason: 'no-empty-controls',
      businessContext,
      message:
        '页面适配已启用，但当前页面没有未填写的可编辑控件，已停止以避免覆盖页面已有值。',
    };
  }

  const scored = controls
    .map((element) =>
      scoreControl(
        element,
        buildControlContext(element, businessContext),
        businessContext,
        data
      )
    )
    .sort((a, b) => b.score - a.score);

  const [best, second] = scored;
  const threshold = Number(data.adaptiveThreshold ?? 0.75);

  if (!best || best.score < threshold) {
    return {
      ok: false,
      reason: 'confidence-too-low',
      businessContext,
      highestConfidence: best?.score ?? 0,
      threshold,
      candidates: scored.slice(0, 3).map((item) => ({
        score: item.score,
        element: describeElement(item.element),
        evidence: item.evidence,
      })),
      message: `页面适配候选最高置信度 ${
        best?.score ?? 0
      }，低于阈值 ${threshold}，未执行填报。`,
    };
  }

  if (second && best.score - second.score < 0.08) {
    return {
      ok: false,
      reason: 'ambiguous-match',
      businessContext,
      highestConfidence: best.score,
      secondConfidence: second.score,
      threshold,
      candidates: scored.slice(0, 3).map((item) => ({
        score: item.score,
        element: describeElement(item.element),
        evidence: item.evidence,
      })),
      message: '页面适配存在多个分数接近的候选控件，已停止以避免误填。',
    };
  }

  return {
    ok: true,
    element: best.element,
    businessContext,
    confidence: best.score,
    matchedBy: best.evidence.map((item) => item.code),
    selectorUsed: describeElement(best.element),
    evidence: best.evidence,
    message: `CSS选择器匹配失败，已通过税务页面适配定位到 ${businessContext.label}。`,
  };
}

export default findAdaptiveTaxVatControl;
