import browser from 'webextension-polyfill';

export const TAX_REPORT_VARS_KEY = 'taxReportFileVariables';

/**
 * @typedef {object} TaxReportVariable
 * @property {string} id
 * @property {string} label
 * @property {string} path
 * @property {number=} createdAt
 * @property {number=} updatedAt
 */

export const TAX_FILE_PATH_VARIABLE = 'TaxFilePath';

function normalizeReportVariable(row) {
  if (!row || typeof row !== 'object') return null;
  const label = String(row.label || row.name || row.variableName || '').trim();
  const path = String(row.path || row.filePath || '').trim();
  if (!label || !path) return null;

  const now = Date.now();
  return {
    id: String(row.id || `${label}-${now}`),
    label,
    path,
    createdAt: row.createdAt || now,
    updatedAt: row.updatedAt || row.createdAt || now,
  };
}

/** Sort by createdAt descending so newest entries come first */
function sortByCreatedAtDesc(list) {
  return [...list].sort(
    (a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)
  );
}

/**
 * @returns {Promise<TaxReportVariable[]>}
 */
export async function loadTaxReportVariables() {
  const { [TAX_REPORT_VARS_KEY]: raw } = await browser.storage.local.get(
    TAX_REPORT_VARS_KEY
  );
  return Array.isArray(raw)
    ? sortByCreatedAtDesc(raw.map(normalizeReportVariable).filter(Boolean))
    : [];
}

/**
 * @param {TaxReportVariable[]} list
 */
export async function saveTaxReportVariables(list) {
  const normalized = Array.isArray(list)
    ? sortByCreatedAtDesc(list.map(normalizeReportVariable).filter(Boolean))
    : [];
  await browser.storage.local.set({ [TAX_REPORT_VARS_KEY]: normalized });
}
