/**
 * 数据校验规则引擎
 *
 * 规则定义：
 * {
 *   id: 'unique-rule-id',
 *   severity: 'error' | 'warning' | 'info',
 *   field?: string,             // 关联的字段路径，便于 UI 定位
 *   message: string,            // 默认描述（i18n key 通过 messageKey 传入）
 *   messageKey?: string,
 *   when?: (model) => boolean,  // 条件触发
 *   run: (model, helpers) => undefined | { message?, detail? }
 * }
 *
 * 规则函数返回 falsy 表示通过；返回对象（或字符串）表示有发现。
 */

const ABS_TOLERANCE = 0.5;

export const helpers = {
  approxEqual(a, b, tolerance = ABS_TOLERANCE) {
    if (a == null || b == null) return false;
    return Math.abs(Number(a) - Number(b)) <= tolerance;
  },
  sumOf(...values) {
    return values.reduce((acc, v) => acc + (Number(v) || 0), 0);
  },
  numeric(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  },
  isBlank(value) {
    return (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '')
    );
  },
  formatAmount(value) {
    if (value === null || value === undefined || value === '') return '空';
    return Number(value).toLocaleString('zh-CN', {
      maximumFractionDigits: 2,
    });
  },
};

function normalizeFinding(finding, rule) {
  if (!finding) return null;
  const base = {
    ruleId: rule.id,
    severity: rule.severity || 'warning',
    field: rule.field || null,
    message: rule.message || '',
    detail: null,
  };
  if (typeof finding === 'string') {
    return { ...base, message: finding };
  }
  return {
    ...base,
    ...(finding.severity ? { severity: finding.severity } : {}),
    ...(finding.field ? { field: finding.field } : {}),
    ...(finding.message ? { message: finding.message } : {}),
    ...(finding.detail !== undefined ? { detail: finding.detail } : {}),
  };
}

export function groupBySeverity(findings) {
  const errors = [];
  const warnings = [];
  const infos = [];
  for (const f of findings) {
    if (f.severity === 'error') errors.push(f);
    else if (f.severity === 'warning') warnings.push(f);
    else infos.push(f);
  }
  return {
    findings,
    errors,
    warnings,
    infos,
    counts: {
      error: errors.length,
      warning: warnings.length,
      info: infos.length,
      total: findings.length,
    },
  };
}

/**
 * 顺序运行规则。
 * @param {Array} rules
 * @param {object} model
 * @returns {Promise<{ findings: Array, errors: Array, warnings: Array, infos: Array }>}
 */
export async function runRules(rules, model) {
  const findings = [];

  for (const rule of rules) {
    if (rule && typeof rule.run === 'function') {
      let shouldRun = true;
      if (typeof rule.when === 'function') {
        try {
          shouldRun = Boolean(rule.when(model, helpers));
        } catch (err) {
          findings.push({
            ruleId: rule.id,
            severity: 'error',
            field: rule.field || null,
            message: `规则 when() 抛错: ${err.message}`,
            detail: { stack: err.stack },
          });
          shouldRun = false;
        }
      }

      if (shouldRun) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await rule.run(model, helpers);
          const finding = normalizeFinding(result, rule);
          if (finding) findings.push(finding);
        } catch (err) {
          findings.push({
            ruleId: rule.id,
            severity: 'error',
            field: rule.field || null,
            message: `规则 ${rule.id} 抛错: ${err.message}`,
            detail: { stack: err.stack },
          });
        }
      }
    }
  }

  return groupBySeverity(findings);
}

export default runRules;
