import { META_FIELDS, MAIN_LINES } from '../../schema/vatGeneralSchema';

const TAXPAYER_NO_REGEX = /^[0-9A-Z]{15,18}$/;
const PERIOD_REGEX = /\d{4}.*?\d{1,2}.*?\d{1,2}/;

const metaRules = META_FIELDS.filter((field) => field.required).map(
  (field) => ({
    id: `meta.required.${field.id}`,
    severity: 'error',
    field: `meta.${field.id}`,
    message: `${field.label}为必填`,
    run(model, helpers) {
      if (helpers.isBlank(model.meta?.[field.id])) {
        return { message: `${field.label}为必填，未在模板中读取到值` };
      }
      return null;
    },
  })
);

const lineNumericRules = MAIN_LINES.flatMap((def) => {
  const rules = [];
  if (def.required) {
    rules.push({
      id: `line.required.${def.id}.generalCurrent`,
      severity: 'error',
      field: `lines.${def.id}.generalCurrent`,
      message: `第${def.line}栏 ${def.label} 一般项目本月数为必填`,
      run(model, helpers) {
        const v = model.lineValue(def.id, 'generalCurrent');
        if (helpers.isBlank(v) || v === null) {
          return {
            message: `第${def.line}栏「${def.label}」一般项目本月数缺失`,
          };
        }
        return null;
      },
    });
  }
  if (def.nonNegative) {
    rules.push({
      id: `line.nonNegative.${def.id}`,
      severity: 'error',
      field: `lines.${def.id}.generalCurrent`,
      message: `第${def.line}栏 ${def.label} 不应为负数`,
      run(model, helpers) {
        const cols = [
          'generalCurrent',
          'generalYear',
          'refundCurrent',
          'refundYear',
        ];
        for (const col of cols) {
          const v = model.lineValue(def.id, col);
          if (v != null && Number(v) < 0) {
            return {
              message: `第${def.line}栏「${
                def.label
              }」${col} 出现负数 ${helpers.formatAmount(v)}`,
              detail: { value: v, column: col },
            };
          }
        }
        return null;
      },
    });
  }
  return rules;
});

const taxpayerNoRule = {
  id: 'meta.format.taxpayerNo',
  severity: 'error',
  field: 'meta.taxpayerNo',
  message: '纳税人识别号格式不正确',
  run(model) {
    const value = String(model.meta?.taxpayerNo || '').trim();
    if (!value) return null;
    if (!TAXPAYER_NO_REGEX.test(value)) {
      return {
        message: `纳税人识别号「${value}」格式不正确，应为 15-18 位字母或数字`,
      };
    }
    return null;
  },
};

const periodRule = {
  id: 'meta.format.periodRange',
  severity: 'warning',
  field: 'meta.periodRange',
  message: '税款所属时间格式异常',
  run(model) {
    const value = String(model.meta?.periodRange || '').trim();
    if (!value) return null;
    if (!PERIOD_REGEX.test(value)) {
      return { message: `税款所属时间「${value}」格式异常，建议核对` };
    }
    return null;
  },
};

const structuralRules = [
  ...metaRules,
  taxpayerNoRule,
  periodRule,
  ...lineNumericRules,
];

export default structuralRules;
