/**
 * 上海市电子税务局「增值税及附加税费申报表（一般纳税人适用）」字段→DOM 映射。
 *
 * 注意：网站结构在重大版本升级时可能变动，因此：
 *   - 每个字段都带 `selectorCandidates`（多个候选选择器，按顺序尝试）
 *   - tax-vat-fill 启动时先做一次 `selectorHealthCheck`，
 *     若关键字段全部失败则触发软门禁报错。
 *
 * 选择器以 input/element 为粒度。`source` 描述该字段对应数据模型路径。
 *
 * 由于真实站点的 DOM 需要登录后才能确定，下列选择器为占位骨架，
 * 配置文件本身可独立维护、随时替换为真实选择器（无需改动 handler 代码）。
 */

export const ETAX_SHANGHAI_VAT_URL =
  'https://etax.shanghai.chinatax.gov.cn:8443/';

const lineSelector = (line) => [
  `input[data-line="${line}"]`,
  `input[name="line${line}"]`,
  `input[id="vat_line_${line}"]`,
];

export const fieldMap = [
  {
    id: 'taxpayerNo',
    label: '纳税人识别号',
    source: 'meta.taxpayerNo',
    selectorCandidates: [
      'input[name="taxpayerNo"]',
      'input[id="taxpayerNo"]',
      'input[data-field="taxpayer-no"]',
    ],
    optional: true,
  },
  {
    id: 'taxpayerName',
    label: '纳税人名称',
    source: 'meta.taxpayerName',
    selectorCandidates: [
      'input[name="taxpayerName"]',
      'input[id="taxpayerName"]',
    ],
    optional: true,
  },
  {
    id: 'periodRange',
    label: '税款所属时间',
    source: 'meta.periodRange',
    selectorCandidates: ['input[name="taxPeriod"]', 'input[id="taxPeriod"]'],
    optional: true,
  },
  ...[
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 21, 23, 24, 25,
    26, 28, 29, 30, 31, 35, 36, 37, 39, 40, 41,
  ].map((line) => ({
    id: `line${line}.generalCurrent`,
    label: `第${line}栏（一般项目本月数）`,
    source: `lines.line${line}.generalCurrent`,
    selectorCandidates: lineSelector(line),
    type: 'number',
    optional: line >= 25,
  })),
];

/**
 * 关键字段（任一失败则视为映射不可用）。
 */
export const CRITICAL_FIELDS = [
  'taxpayerNo',
  'line11.generalCurrent',
  'line12.generalCurrent',
  'line24.generalCurrent',
];

/**
 * 供 tax-vat-fill 在正式填表前注入页面执行的 DOM 探针（关键字段的选择器候选）。
 */
export function getCriticalDomProbes() {
  return fieldMap
    .filter((entry) => CRITICAL_FIELDS.includes(entry.id))
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      selectorCandidates: entry.selectorCandidates,
    }));
}

/**
 * 由模型按 fieldMap 生成填报指令列表。
 */
export function buildFillPlan(model) {
  return fieldMap
    .map((entry) => {
      const value = model.get ? model.get(entry.source) : null;
      return {
        id: entry.id,
        label: entry.label,
        source: entry.source,
        selectorCandidates: entry.selectorCandidates,
        value: value == null ? '' : String(value),
        critical: CRITICAL_FIELDS.includes(entry.id),
        optional: entry.optional ?? false,
      };
    })
    .filter((entry) => entry.value !== '' || entry.critical || !entry.optional);
}

export default {
  fieldMap,
  ETAX_SHANGHAI_VAT_URL,
  buildFillPlan,
  getCriticalDomProbes,
  CRITICAL_FIELDS,
};
