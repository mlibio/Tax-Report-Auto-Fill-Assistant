/**
 * 增值税主表业务勾稽规则。
 *
 * 数据来源：国家税务总局公告（增值税申报表填报口径）；
 * 这里实现的是常用的、可机械校验的勾稽关系。
 *
 * 容差：金额类计算结果默认放大到 0.5 元，以兼容四舍五入差异。
 */

const TOLERANCE = 0.5;
const VAT_RATE_OPTIONS = [0.13, 0.09, 0.06, 0.05, 0.03, 0.01];

const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);

const businessRules = [
  {
    id: 'business.line17.formula',
    severity: 'error',
    field: 'lines.line17.generalCurrent',
    message: '应抵扣税额合计应等于 12+13-14-15+16',
    run(model, helpers) {
      const v17 = model.lineValue('line17');
      if (v17 == null) return null;
      const expected =
        num(model.lineValue('line12')) +
        num(model.lineValue('line13')) -
        num(model.lineValue('line14')) -
        num(model.lineValue('line15')) +
        num(model.lineValue('line16'));
      if (!helpers.approxEqual(v17, expected, TOLERANCE)) {
        return {
          message: `第17栏应抵扣税额合计 ${helpers.formatAmount(
            v17
          )} 与 12+13-14-15+16=${helpers.formatAmount(expected)} 不符`,
          detail: { actual: v17, expected },
        };
      }
      return null;
    },
  },
  {
    id: 'business.line18.minRule',
    severity: 'error',
    field: 'lines.line18.generalCurrent',
    message: '实际抵扣税额应等于 min(应抵扣税额合计, 销项税额)',
    run(model, helpers) {
      const v18 = model.lineValue('line18');
      if (v18 == null) return null;
      const v17 = num(model.lineValue('line17'));
      const v11 = num(model.lineValue('line11'));
      const expected = Math.min(v17, v11);
      if (!helpers.approxEqual(v18, expected, TOLERANCE)) {
        return {
          message: `第18栏实际抵扣税额 ${helpers.formatAmount(
            v18
          )} 应等于 min(17栏=${helpers.formatAmount(
            v17
          )}, 11栏=${helpers.formatAmount(v11)})=${helpers.formatAmount(
            expected
          )}`,
          detail: { actual: v18, expected },
        };
      }
      return null;
    },
  },
  {
    id: 'business.line19.formula',
    severity: 'error',
    field: 'lines.line19.generalCurrent',
    message: '应纳税额应等于 11-18',
    run(model, helpers) {
      const v19 = model.lineValue('line19');
      if (v19 == null) return null;
      const expected =
        num(model.lineValue('line11')) - num(model.lineValue('line18'));
      if (!helpers.approxEqual(v19, expected, TOLERANCE)) {
        return {
          message: `第19栏应纳税额 ${helpers.formatAmount(
            v19
          )} 与 11-18=${helpers.formatAmount(expected)} 不符`,
          detail: { actual: v19, expected },
        };
      }
      return null;
    },
  },
  {
    id: 'business.line20.formula',
    severity: 'error',
    field: 'lines.line20.generalCurrent',
    message: '期末留抵税额应等于 17-18',
    run(model, helpers) {
      const v20 = model.lineValue('line20');
      if (v20 == null) return null;
      const expected =
        num(model.lineValue('line17')) - num(model.lineValue('line18'));
      if (!helpers.approxEqual(v20, expected, TOLERANCE)) {
        return {
          message: `第20栏期末留抵税额 ${helpers.formatAmount(
            v20
          )} 与 17-18=${helpers.formatAmount(expected)} 不符`,
          detail: { actual: v20, expected },
        };
      }
      return null;
    },
  },
  {
    id: 'business.line24.formula',
    severity: 'error',
    field: 'lines.line24.generalCurrent',
    message: '应纳税额合计应等于 19+21-23',
    run(model, helpers) {
      const v24 = model.lineValue('line24');
      if (v24 == null) return null;
      const expected =
        num(model.lineValue('line19')) +
        num(model.lineValue('line21')) -
        num(model.lineValue('line23'));
      if (!helpers.approxEqual(v24, expected, TOLERANCE)) {
        return {
          message: `第24栏应纳税额合计 ${helpers.formatAmount(
            v24
          )} 与 19+21-23=${helpers.formatAmount(expected)} 不符`,
          detail: { actual: v24, expected },
        };
      }
      return null;
    },
  },
  {
    id: 'business.line27.formula',
    severity: 'warning',
    field: 'lines.line27.generalCurrent',
    message: '本期已缴税额应等于 28+29+30+31',
    run(model, helpers) {
      const v27 = model.lineValue('line27');
      if (v27 == null) return null;
      const expected =
        num(model.lineValue('line28')) +
        num(model.lineValue('line29')) +
        num(model.lineValue('line30')) +
        num(model.lineValue('line31'));
      if (!helpers.approxEqual(v27, expected, TOLERANCE)) {
        return {
          message: `第27栏本期已缴税额 ${helpers.formatAmount(
            v27
          )} 与 28+29+30+31=${helpers.formatAmount(expected)} 不符`,
          detail: { actual: v27, expected },
        };
      }
      return null;
    },
  },
  {
    id: 'business.line32.formula',
    severity: 'warning',
    field: 'lines.line32.generalCurrent',
    message: '期末未缴税额应等于 24+25+26-27',
    run(model, helpers) {
      const v32 = model.lineValue('line32');
      if (v32 == null) return null;
      const expected =
        num(model.lineValue('line24')) +
        num(model.lineValue('line25')) +
        num(model.lineValue('line26')) -
        num(model.lineValue('line27'));
      if (!helpers.approxEqual(v32, expected, TOLERANCE)) {
        return {
          message: `第32栏期末未缴税额 ${helpers.formatAmount(
            v32
          )} 与 24+25+26-27=${helpers.formatAmount(expected)} 不符`,
          detail: { actual: v32, expected },
        };
      }
      return null;
    },
  },
  {
    id: 'business.line34.formula',
    severity: 'warning',
    field: 'lines.line34.generalCurrent',
    message: '本期应补(退)税额应等于 24-28-29',
    run(model, helpers) {
      const v34 = model.lineValue('line34');
      if (v34 == null) return null;
      const expected =
        num(model.lineValue('line24')) -
        num(model.lineValue('line28')) -
        num(model.lineValue('line29'));
      if (!helpers.approxEqual(v34, expected, TOLERANCE)) {
        return {
          message: `第34栏本期应补(退)税额 ${helpers.formatAmount(
            v34
          )} 与 24-28-29=${helpers.formatAmount(expected)} 不符`,
          detail: { actual: v34, expected },
        };
      }
      return null;
    },
  },
  {
    id: 'business.salesVsOutputTax',
    severity: 'warning',
    field: 'lines.line11.generalCurrent',
    message: '销项税额应当落入按销售额*主流税率推算的区间',
    run(model, helpers) {
      const sales = num(model.lineValue('line1'));
      const tax = num(model.lineValue('line11'));
      if (sales <= 0 || tax <= 0) return null;
      const ratio = tax / sales;
      const matched = VAT_RATE_OPTIONS.find(
        (rate) => Math.abs(rate - ratio) <= 0.01
      );
      if (matched) return null;
      const min = sales * Math.min(...VAT_RATE_OPTIONS);
      const max = sales * Math.max(...VAT_RATE_OPTIONS);
      if (tax < min - TOLERANCE || tax > max + TOLERANCE) {
        return {
          message: `销项税额 ${helpers.formatAmount(
            tax
          )} 与销售额 ${helpers.formatAmount(sales)} 的比例 ${(
            ratio * 100
          ).toFixed(2)}% 偏离常见税率 (1/3/5/6/9/13)，请核对`,
          detail: { ratio, sales, tax },
        };
      }
      return {
        severity: 'info',
        message: `销项税额/销售额 = ${(ratio * 100).toFixed(
          2
        )}%（介于常见税率之间，可能为多税率合并销售额）`,
      };
    },
  },
  {
    id: 'business.surchargeBase',
    severity: 'warning',
    field: 'lines.line39.generalCurrent',
    message: '附加税计税依据应当≤ 19+21 实际缴纳额',
    run(model, helpers) {
      const cityTax = num(model.lineValue('line39'));
      const eduTax = num(model.lineValue('line40'));
      const localEdu = num(model.lineValue('line41'));
      const surcharge = cityTax + eduTax + localEdu;
      const base =
        num(model.lineValue('line19')) + num(model.lineValue('line21'));
      if (surcharge <= 0 || base <= 0) return null;
      // 附加税最高合计 = 7%(城建) + 3%(教育) + 2%(地方教育) = 12% 的应纳增值税
      if (surcharge > base * 0.12 + TOLERANCE) {
        return {
          message: `附加税合计 ${helpers.formatAmount(
            surcharge
          )} 高于应缴增值税(19+21)*12%=${helpers.formatAmount(
            base * 0.12
          )}，请核对计税依据`,
        };
      }
      return null;
    },
  },
];

export default businessRules;
