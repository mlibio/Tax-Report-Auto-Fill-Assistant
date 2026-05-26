import BrowserAPIService from '@/service/browser-api/BrowserAPIService';
import {
  buildFillPlan,
  etaxCriticalFields,
  getCriticalDomProbes,
} from '@/business/tax';

function domProbeFunction(probes) {
  const missing = [];
  for (const entry of probes) {
    let found = false;
    for (const selector of entry.selectorCandidates || []) {
      try {
        if (document.querySelector(selector)) {
          found = true;
          break;
        }
      } catch (err) {
        // ignore invalid selector
      }
    }
    if (!found) missing.push(entry.id);
  }
  return { ok: missing.length === 0, missing };
}

function fillFunction(plan, options) {
  const results = [];
  const wait = (ms) =>
    new Promise((res) => {
      setTimeout(res, ms);
    });

  function findElement(candidates) {
    for (const selector of candidates) {
      try {
        const el = document.querySelector(selector);
        if (el) return { el, selector };
      } catch (err) {
        // ignore invalid selector
      }
    }
    return { el: null, selector: null };
  }

  async function process() {
    for (const entry of plan) {
      const { el, selector } = findElement(entry.selectorCandidates);
      if (!el) {
        results.push({
          id: entry.id,
          status: 'missing-selector',
          critical: entry.critical,
          tried: entry.selectorCandidates,
        });
      } else {
        try {
          const tagName = el.tagName?.toLowerCase();
          if (tagName === 'select') {
            el.value = entry.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (
            tagName === 'input' &&
            (el.type === 'checkbox' || el.type === 'radio')
          ) {
            el.checked = Boolean(entry.value && entry.value !== '0');
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            const proto = Object.getPrototypeOf(el);
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (setter) setter.call(el, entry.value);
            else el.value = entry.value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          results.push({
            id: entry.id,
            status: 'filled',
            selector,
            value: entry.value,
          });
        } catch (err) {
          results.push({
            id: entry.id,
            status: 'error',
            selector,
            message: err.message,
          });
        }
      }
      if (options.delayBetweenFields > 0) {
        // eslint-disable-next-line no-await-in-loop
        await wait(options.delayBetweenFields);
      }
    }
    return results;
  }

  return process();
}

export default async function ({ id, data }, { refData }) {
  const modelVariable = data.modelVariable || 'vatModel';
  const reportVariable = data.reportVariable || 'vatValidationReport';

  const model = refData?.variables?.[modelVariable];
  if (!model) {
    throw new Error(
      `tax-vat-fill: 变量 ${modelVariable} 不存在，请先运行 tax-vat-load`
    );
  }

  const report = refData?.variables?.[reportVariable];
  if (
    report &&
    report.counts?.error > 0 &&
    !(Array.isArray(report.overrides) && report.overrides.length > 0)
  ) {
    const error = new Error(
      `tax-vat-fill: 校验报告存在 ${report.counts.error} 个错误且未获得覆盖，已阻止填报`
    );
    error.data = { report };
    throw error;
  }

  const plan = buildFillPlan(model);

  if (data.skipOptional) {
    for (let i = plan.length - 1; i >= 0; i -= 1) {
      if (plan[i].optional && plan[i].value === '') plan.splice(i, 1);
    }
  }

  const tab = this.activeTab;
  if (!tab?.id) {
    throw new Error(
      'tax-vat-fill: 没有活动 Tab，请先打开上海电子税务局申报页面'
    );
  }

  const probes = getCriticalDomProbes();
  try {
    const probeResult = await BrowserAPIService.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [tab.frameId || 0] },
      world: 'MAIN',
      args: [probes],
      func: domProbeFunction,
    });
    const probe = probeResult?.[0]?.result;
    if (probe && probe.ok === false && probe.missing?.length) {
      const error = new Error(
        `tax-vat-fill: 页面 selector 健康检查失败，关键字段未找到 (${probe.missing.join(
          ', '
        )})，请确认已打开正确的申报表单或更新映射配置`
      );
      error.data = {
        healthCheck: probe,
        criticalFields: etaxCriticalFields,
      };
      throw error;
    }
  } catch (error) {
    if (error?.data?.healthCheck) throw error;
    const wrapped = new Error(
      `tax-vat-fill: selector 健康检查执行失败：${error.message}`
    );
    wrapped.data = { reason: 'health-check-failed', cause: error.message };
    throw wrapped;
  }

  let executionResults = [];
  try {
    const exec = await BrowserAPIService.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [tab.frameId || 0] },
      world: 'MAIN',
      args: [plan, { delayBetweenFields: data.delayBetweenFields ?? 80 }],
      func: fillFunction,
    });
    executionResults = exec?.[0]?.result || [];
  } catch (error) {
    error.data = { reason: 'executeScript-failed', message: error.message };
    throw error;
  }

  const missingCritical = executionResults.filter(
    (r) => r.status === 'missing-selector' && r.critical
  );

  if (missingCritical.length > 0) {
    const error = new Error(
      `tax-vat-fill: 关键字段未在页面找到 (${missingCritical
        .map((m) => m.id)
        .join(', ')})，可能站点结构已变更或页面尚未加载完成`
    );
    error.data = {
      missingCritical,
      criticalFields: etaxCriticalFields,
      results: executionResults,
    };
    throw error;
  }

  const summary = {
    filled: executionResults.filter((r) => r.status === 'filled').length,
    skipped: executionResults.filter((r) => r.status === 'missing-selector')
      .length,
    errors: executionResults.filter((r) => r.status === 'error').length,
    total: executionResults.length,
  };

  await this.setVariable('vatFillResult', {
    summary,
    results: executionResults,
  });

  return {
    data: { summary, results: executionResults },
    nextBlockId: this.getBlockConnections(id),
  };
}
