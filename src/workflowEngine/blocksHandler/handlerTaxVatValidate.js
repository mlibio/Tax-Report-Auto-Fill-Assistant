import { runAllRules } from '@/business/tax';

export default async function ({ id, data }, { refData }) {
  const modelVariable = data.modelVariable || 'vatModel';
  const reportVariable = data.reportVariable || 'vatValidationReport';
  const gateMode = data.gateMode || 'soft';
  const allowOverride = data.allowOverride !== false;

  const model = refData?.variables?.[modelVariable];
  if (!model || typeof model !== 'object') {
    throw new Error(
      `tax-vat-validate: 变量 ${modelVariable} 不存在或不是数据模型，请先运行 tax-vat-load`
    );
  }

  const report = await runAllRules(model);
  const summary = {
    schemaVersion: model.schemaVersion,
    counts: report.counts,
    errors: report.errors,
    warnings: report.warnings,
    infos: report.infos,
    findings: report.findings,
    overrides: refData?.variables?.vatValidationOverrides || [],
    runAt: Date.now(),
  };

  await this.setVariable(reportVariable, summary);

  if (
    gateMode === 'hard' &&
    report.counts.error > 0 &&
    !(allowOverride && summary.overrides?.length)
  ) {
    const error = new Error(
      `数据校验未通过：发现 ${report.counts.error} 个错误。请在仪表板修正后再继续。`
    );
    error.data = summary;
    throw error;
  }

  return {
    data: summary,
    nextBlockId: this.getBlockConnections(id),
  };
}
