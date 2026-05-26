import { parseVatExcel, createVatModel, ParserError } from '@/business/tax';
import getFile, { readFileAsBase64 } from '@/utils/getFile';
import { TAX_FILE_PATH_VARIABLE } from '@/utils/taxReportVariables';
import renderString from '../templating/renderString';

async function readBase64FromGlobal(refData, key) {
  const value = refData?.globalData?.[key];
  if (!value) return null;
  if (typeof value === 'string') return value;
  return null;
}

async function readBase64FromVariable(refData, key) {
  const value = refData?.variables?.[key];
  if (!value) return null;
  if (typeof value === 'string') return value;
  return null;
}

function pickPathFromVariables(vars, preferredKey) {
  if (!vars || typeof vars !== 'object') return null;
  if (preferredKey && typeof vars[preferredKey] === 'string') {
    const p = vars[preferredKey].trim();
    if (p) return p;
  }
  const fallbacks = ['param0', TAX_FILE_PATH_VARIABLE, 'taxReportPath'];
  for (const k of fallbacks) {
    if (preferredKey === k) continue;
    if (typeof vars[k] === 'string' && vars[k].trim()) return vars[k].trim();
  }
  return null;
}

async function tryReadWorkbookBase64FromPathVars(refData) {
  const path = pickPathFromVariables(refData?.variables || {}, null);
  if (!path) return null;
  try {
    const blob = await getFile(path, {
      responseType: 'blob',
      returnValue: true,
    });
    if (!blob) return null;
    return readFileAsBase64(blob);
  } catch {
    return null;
  }
}

async function renderIfNeeded(raw, refData, isPopup) {
  const str = String(raw ?? '');
  if (!str.trim()) return '';
  if (!/\{\{[\s\S]*\}\}/.test(str)) return str.trim();
  const { value } = await renderString(str, refData, isPopup);
  return String(value ?? '').trim();
}

export default async function ({ id, data }, { refData }) {
  const source = data.source || 'globalData';
  const outputVariable = data.outputVariable || 'vatModel';
  const isPopup = this.engine.isPopup;

  let workbookInput = null;

  if (source === 'globalData') {
    const key = data.globalDataKey || 'vatExcelBase64';
    let base64 = await readBase64FromGlobal(refData, key);
    if (!base64) {
      base64 = await tryReadWorkbookBase64FromPathVars(refData);
    }
    if (!base64) {
      throw new Error(
        `tax-vat-load: globalData.${key} 中没有 Excel base64，且变量 param0 / ${TAX_FILE_PATH_VARIABLE} / taxReportPath 中也没有可用的本地文件路径。请将节点改为「从变量读取文件路径」，或在仪表板导入为 base64。`
      );
    }
    workbookInput = base64;
  } else if (source === 'variable') {
    const key = data.variableKey || 'vatExcelBase64';
    const base64 = await readBase64FromVariable(refData, key);
    if (!base64) {
      throw new Error(`tax-vat-load: 变量 ${key} 中没有 Excel base64 内容`);
    }
    workbookInput = base64;
  } else if (source === 'filePath') {
    const path = await renderIfNeeded(data.filePath, refData, isPopup);
    if (!path) throw new Error('tax-vat-load: 未提供 filePath');
    const blob = await getFile(path, {
      responseType: 'blob',
      returnValue: true,
    });
    if (!blob) {
      throw new Error(`tax-vat-load: 无法读取文件 ${path}`);
    }
    const base64 = await readFileAsBase64(blob);
    workbookInput = base64;
  } else if (source === 'variablePath') {
    let key =
      (await renderIfNeeded(data.variableKey, refData, isPopup)) ||
      TAX_FILE_PATH_VARIABLE;
    const vars = refData?.variables || {};
    let path = pickPathFromVariables(vars, key);
    if (!path) {
      throw new Error(
        `tax-vat-load: 变量 ${key || '(未配置)'} 中没有 Excel 文件地址（已尝试 param0、${TAX_FILE_PATH_VARIABLE}、taxReportPath）`
      );
    }
    const blob = await getFile(path, {
      responseType: 'blob',
      returnValue: true,
    });
    if (!blob) {
      throw new Error(`tax-vat-load: 无法读取文件 ${path}`);
    }
    const base64 = await readFileAsBase64(blob);
    workbookInput = base64;
  } else {
    throw new Error(`tax-vat-load: 不支持的 source "${source}"`);
  }

  let model;
  try {
    const parsed = await parseVatExcel(workbookInput);
    model = createVatModel(parsed);
  } catch (error) {
    if (error instanceof ParserError) {
      const wrapped = new Error(`增值税申报表解析失败：${error.message}`);
      wrapped.data = error.details;
      throw wrapped;
    }
    throw error;
  }

  await this.setVariable(outputVariable, model);

  return {
    data: {
      schemaVersion: model.schemaVersion,
      taxpayerNo: model.meta?.taxpayerNo,
      taxpayerName: model.meta?.taxpayerName,
      periodRange: model.meta?.periodRange,
      lineCount: Object.keys(model.lines).length,
    },
    nextBlockId: this.getBlockConnections(id),
  };
}
