import { read as readXlsx, utils as utilsXlsx } from 'xlsx';
import Papa from 'papaparse';
import { parseJSON } from '@/utils/helper';
import getFile, { readFileAsBase64 } from '@/utils/getFile';
import renderString from '../templating/renderString';

function normalizeFilePath(path) {
  let normalizedPath = `${path || ''}`.trim();
  const parsedPath = parseJSON(normalizedPath, null);

  if (typeof parsedPath === 'string') normalizedPath = parsedPath.trim();

  return normalizedPath
    .replace(/^(['"])(.*\.(?:csv|json|xlsx?))\1$/i, '$2')
    .replace(/^(['"])(.*)\1(\.[a-z0-9]+)$/i, '$2$3')
    .replace(/^(['"])(.*)\1(xlsx?)$/i, '$2.$3');
}

// Detects whether a rendered string looks like a supported file path
// (single line, ends with a known delimited/json/excel extension, not absurdly long).
function isSupportedFilePath(path) {
  if (typeof path !== 'string') return false;
  const trimmed = path.trim();
  if (!trimmed) return false;
  if (/[\r\n]/.test(trimmed)) return false;
  if (trimmed.length > 1024) return false;
  return /\.(?:csv|json|xlsx?)$/i.test(trimmed);
}

// True only when the input is essentially a single mustache reference
// (e.g. "{{variables.param0}}" with optional surrounding whitespace).
function isPureMustacheReference(str) {
  if (typeof str !== 'string') return false;
  return /^\s*\{\{[^{}]+\}\}\s*$/.test(str);
}

function readBlobAsArrayBuffer(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.readAsArrayBuffer(blob);
  });
}

async function readExcelWorkbook(input) {
  if (input instanceof Blob) {
    return readXlsx(await readBlobAsArrayBuffer(input), { type: 'array' });
  }

  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    return readXlsx(input, { type: 'array' });
  }

  if (typeof input === 'string') {
    const base64Index = input.indexOf(',');
    if (input.startsWith('data:') && base64Index >= 0) {
      return readXlsx(input.slice(base64Index + 1), { type: 'base64' });
    }

    return readXlsx(input, { type: 'binary' });
  }

  throw new Error('Excel file content is not readable');
}

// Loads a file by absolute path / URL, then parses its contents according to
// the requested action. This is the same pipeline that the explicit "isFile"
// branch uses and is now shared by the value-field auto-detection path.
async function loadFileByPath(path, fileOptions = {}) {
  const isExcel = /\.xlsx?$/i.test(path);
  const isJSON = path.toLowerCase().endsWith('.json');
  const isCSV = path.toLowerCase().endsWith('.csv');

  const action = fileOptions.action || 'default';
  const readAsJson = action.includes('json');

  let responseType = 'text';

  if (isJSON) responseType = 'json';
  else if (isExcel && readAsJson) responseType = 'arraybuffer';
  else if (action === 'base64' || (isExcel && action !== 'default'))
    responseType = 'blob';

  let result = await getFile(path, {
    responseType,
    returnValue: true,
  });

  if (action === 'base64') {
    result = await readFileAsBase64(result);
  } else if (result && isCSV && readAsJson) {
    const parsedCSV = Papa.parse(result, {
      header: action.includes('header'),
    });
    result = parsedCSV.data || [];
  } else if (isExcel && readAsJson) {
    const wb = await readExcelWorkbook(result);

    const inputtedSheet = (fileOptions.xlsSheet || '').trim();
    const sheetName = wb.SheetNames.includes(inputtedSheet)
      ? inputtedSheet
      : wb.SheetNames[0];

    const options = {};
    if (fileOptions.xlsRange) options.range = fileOptions.xlsRange;
    if (!action.includes('header')) options.header = 1;

    const sheetData = utilsXlsx.sheet_to_json(wb.Sheets[sheetName], options);
    result = sheetData;
  }

  return result;
}

async function insertData({ id, data }, { refData }) {
  const replacedValueList = {};

  for (const item of data.dataList) {
    let value = '';

    if (item.isFile) {
      const replacedPath = await renderString(
        item.filePath || '',
        refData,
        this.engine.isPopup
      );
      const path = normalizeFilePath(replacedPath.value);

      value = await loadFileByPath(path, {
        action: item.action || item.csvAction || 'default',
        xlsSheet: item.xlsSheet,
        xlsRange: item.xlsRange,
      });

      Object.assign(replacedValueList, replacedPath.list);
    } else {
      const rawValue = item.value;
      const replacedValue = await renderString(
        rawValue,
        refData,
        this.engine.isPopup
      );
      Object.assign(replacedValueList, replacedValue.list);

      const renderedStr = replacedValue.value;
      const hasMustacheRef =
        typeof rawValue === 'string' && /\{\{[^{}]+\}\}/.test(rawValue);
      const autoFile = item.autoFile !== false;

      let consumedAsFile = false;

      // Auto-detect: when the user wrote a {{ref}} that resolves to a file path,
      // load and parse the file using the existing Insert Data pipeline.
      if (autoFile && hasMustacheRef) {
        const candidatePath = normalizeFilePath(renderedStr);
        if (isSupportedFilePath(candidatePath)) {
          const isJsonFile = candidatePath.toLowerCase().endsWith('.json');
          const userAction = item.action || item.csvAction;
          // In the auto-detection branch we treat the unset/"default" action
          // as a request for the most useful parsed form: JSON arrays for
          // delimited files (.xls/.xlsx/.csv) and the decoded body for .json
          // files. Reading a binary .xls file as raw text is almost never what
          // the user intends here. Explicit action choices ("base64",
          // "json-header", etc.) are still respected.
          const fallbackAction = isJsonFile ? 'default' : 'json';
          const action =
            !userAction || userAction === 'default'
              ? fallbackAction
              : userAction;

          try {
            value = await loadFileByPath(candidatePath, {
              action,
              xlsSheet: item.xlsSheet,
              xlsRange: item.xlsRange,
            });
            consumedAsFile = true;
          } catch (error) {
            // Surface the error only when the input was a pure {{ref}}, since
            // in that case the user clearly wanted the file. Otherwise fall
            // back to inserting the rendered string as-is.
            if (isPureMustacheReference(rawValue)) {
              throw new Error(
                `Insert Data: 无法读取由 ${rawValue.trim()} 引用的文件 "${candidatePath}"：${
                  error.message
                }`
              );
            }
          }
        }
      }

      if (!consumedAsFile) {
        value = parseJSON(renderedStr, renderedStr);
      }
    }

    if (item.type === 'table') {
      const values = typeof value === 'string' ? value.split('||') : [value];
      values.forEach((tableValue) => {
        this.addDataToColumn(item.name, tableValue);
      });
    } else {
      const variableName = await renderString(
        item.name,
        refData,
        this.engine.isPopup
      );
      await this.setVariable(variableName.value, value);
    }
  }

  return {
    data: '',
    replacedValue: replacedValueList,
    nextBlockId: this.getBlockConnections(id),
  };
}

export default insertData;
