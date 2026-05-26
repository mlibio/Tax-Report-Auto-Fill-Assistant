/**
 * 主表与附列资料之间的勾稽规则。
 *
 * 实现的勾稽点（与本期模板一致）：
 *   1. 附列资料（一）合计销项税额 == 主表第 11 栏 销项税额
 *   2. 附列资料（二）合计税额 == 主表第 12 栏 进项税额
 *   3. 附列资料（三）扣除项目合计 ≤ 主表第 1 栏 销售额
 *   4. 附列资料（四）期末余额 ≥ 主表第 23 栏 应纳税额减征额
 */

const TOLERANCE = 0.5;
const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);

const crossSheetRules = [
  {
    id: 'cross.appendix1.outputTax',
    severity: 'warning',
    field: 'lines.line11.generalCurrent',
    message: '附列资料（一）合计销项税额 应与 主表第 11 栏 一致',
    when(model) {
      return num(model.appendix?.appendix1?.outputTax) > 0;
    },
    run(model, helpers) {
      const total = num(model.appendix?.appendix1?.outputTax);
      const main = num(model.lineValue('line11'));
      if (!helpers.approxEqual(total, main, TOLERANCE * 4)) {
        return {
          message: `附列资料（一）合计销项税额 ${helpers.formatAmount(
            total
          )} 与主表第11栏 ${helpers.formatAmount(
            main
          )} 不符（差异 ${helpers.formatAmount(total - main)}）`,
          detail: { appendix: total, main },
        };
      }
      return null;
    },
  },
  {
    id: 'cross.appendix2.inputTax',
    severity: 'warning',
    field: 'lines.line12.generalCurrent',
    message: '附列资料（二）合计税额 应与 主表第 12 栏 一致',
    when(model) {
      return num(model.appendix?.appendix2?.tax) > 0;
    },
    run(model, helpers) {
      const total = num(model.appendix?.appendix2?.tax);
      const main = num(model.lineValue('line12'));
      if (!helpers.approxEqual(total, main, TOLERANCE * 4)) {
        return {
          message: `附列资料（二）合计税额 ${helpers.formatAmount(
            total
          )} 与主表第12栏 ${helpers.formatAmount(main)} 不符`,
          detail: { appendix: total, main },
        };
      }
      return null;
    },
  },
  {
    id: 'cross.appendix3.deduction',
    severity: 'info',
    field: 'lines.line1.generalCurrent',
    message: '附列资料（三）扣除项目合计 不应超过 主表销售额',
    when(model) {
      return num(model.appendix?.appendix3?.deduction) > 0;
    },
    run(model, helpers) {
      const total = num(model.appendix?.appendix3?.deduction);
      const sales = num(model.lineValue('line1'));
      if (total > sales + TOLERANCE) {
        return {
          severity: 'warning',
          message: `附列资料（三）扣除项目合计 ${helpers.formatAmount(
            total
          )} 超过 主表第1栏销售额 ${helpers.formatAmount(sales)}`,
          detail: { appendix: total, main: sales },
        };
      }
      return null;
    },
  },
  {
    id: 'cross.appendix4.endingBalance',
    severity: 'warning',
    field: 'lines.line23.generalCurrent',
    message: '附列资料（四）期末余额 应 ≥ 应纳税额减征额',
    when(model) {
      return num(model.appendix?.appendix4?.endingBalance) > 0;
    },
    run(model, helpers) {
      const balance = num(model.appendix?.appendix4?.endingBalance);
      const reduction = num(model.lineValue('line23'));
      if (balance + TOLERANCE < reduction) {
        return {
          message: `附列资料（四）期末余额 ${helpers.formatAmount(
            balance
          )} 不足以支撑主表第23栏减征额 ${helpers.formatAmount(reduction)}`,
        };
      }
      return null;
    },
  },
];

export default crossSheetRules;
