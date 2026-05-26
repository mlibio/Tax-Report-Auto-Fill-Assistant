<template>
  <div class="container py-8 pb-16">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">{{ t('tax.page.title') }}</h1>
        <p class="mt-1 max-w-3xl text-sm text-slate-500 dark:text-gray-400">
          {{ t('tax.page.subtitle') }}
        </p>
      </div>
      <span
        class="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-500/20 dark:text-green-200"
      >
        {{ t('tax.page.localBadge') }}
      </span>
    </div>

    <div class="mt-6 grid gap-4 xl:grid-cols-[360px_1fr]">
      <ui-card>
        <h2 class="text-lg font-semibold">{{ t('tax.page.manageTitle') }}</h2>
        <p class="mt-1 text-xs text-slate-500 dark:text-gray-400">
          {{ t('tax.page.manageHint') }}
        </p>

        <div class="mt-4 space-y-3">
          <ui-input
            v-model="form.label"
            :label="t('tax.page.reportName')"
            placeholder="5月增值税申报表"
          />
          <ui-input
            v-model="form.path"
            :label="t('tax.page.filePath')"
            placeholder="D:\税务\报表.xls"
          />
          <ui-button class="w-full" variant="accent" @click="addReport">
            <v-remixicon name="riAddLine" class="mr-2 -ml-1" />
            {{ t('tax.page.addReport') }}
          </ui-button>
        </div>

        <div class="mt-5">
          <h3 class="text-sm font-semibold">{{ t('tax.page.reportList') }}</h3>
          <p
            v-if="!reports.length"
            class="mt-3 rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400 dark:border-gray-700 dark:text-gray-500"
          >
            {{ t('tax.page.noReports') }}
          </p>
          <ul v-else class="mt-3 space-y-2">
            <li
              v-for="item in reports"
              :key="item.id"
              class="rounded-lg border p-3 text-sm transition dark:border-gray-700"
              :class="
                selectedId === item.id
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-500/10'
                  : 'border-slate-200 bg-white dark:bg-gray-800'
              "
            >
              <button
                type="button"
                class="block w-full text-left"
                @click="selectReport(item.id)"
              >
                <span class="font-semibold text-slate-800 dark:text-gray-100">
                  {{ item.label }}
                </span>
                <span class="mt-1 block truncate text-xs text-slate-500">
                  {{ item.path }}
                </span>
                <span
                  v-if="item.lastParsedAt"
                  class="mt-1 block text-xs text-slate-400"
                >
                  {{
                    t('tax.page.parsedAt', {
                      time: formatTime(item.lastParsedAt),
                    })
                  }}
                </span>
                <span
                  v-if="item.lastError"
                  class="mt-1 block text-xs text-rose-500"
                >
                  {{ item.lastError }}
                </span>
              </button>
              <div class="mt-3 flex gap-2">
                <ui-button small variant="default" @click="parseReport(item)">
                  {{ t('tax.page.parse') }}
                </ui-button>
                <ui-button
                  small
                  variant="danger"
                  @click="deleteReport(item.id)"
                >
                  {{ t('common.delete') }}
                </ui-button>
              </div>
            </li>
          </ul>
        </div>
      </ui-card>

      <div class="min-w-0 space-y-4">
        <ui-card>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold">{{ t('tax.page.preview') }}</h2>
              <p class="mt-1 text-xs text-slate-500 dark:text-gray-400">
                {{ selectedReport?.path || t('tax.page.previewEmpty') }}
              </p>
            </div>
            <span
              v-if="model"
              class="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-200"
            >
              {{
                t('tax.page.schemaVersion', { version: model.schemaVersion })
              }}
            </span>
          </div>

          <p
            v-if="parseError"
            class="mt-3 break-all rounded-md bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
          >
            {{ parseError }}
          </p>

          <div v-if="model" class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div
              v-for="item in metaPreview"
              :key="item.label"
              class="rounded-lg border border-slate-100 px-3 py-2 dark:border-gray-700"
            >
              <p class="text-xs text-slate-500 dark:text-gray-400">
                {{ item.label }}
              </p>
              <p class="mt-1 truncate text-sm font-medium">
                {{ item.value || '-' }}
              </p>
            </div>
          </div>
        </ui-card>

        <ui-card>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-lg font-semibold">
              {{ t('tax.page.sheetPreview') }}
            </h2>
            <span class="text-xs text-slate-500 dark:text-gray-400">
              {{ t('tax.page.readonly') }}
            </span>
          </div>

          <p
            v-if="!sheets.length"
            class="mt-3 rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-gray-700 dark:text-gray-500"
          >
            {{ t('tax.page.sheetEmpty') }}
          </p>
          <template v-else>
            <div class="mt-3 flex gap-2 overflow-x-auto">
              <button
                v-for="(sheet, index) in sheets"
                :key="sheet.name"
                type="button"
                class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
                :class="
                  activeSheetIndex === index
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-700 dark:text-gray-200'
                "
                @click="activeSheetIndex = index"
              >
                {{ sheet.name }}
              </button>
            </div>
            <div
              class="mt-3 max-h-[560px] overflow-auto rounded-lg border border-slate-200 dark:border-gray-700"
            >
              <table class="w-max min-w-full border-collapse text-xs">
                <tbody>
                  <tr
                    v-for="(row, rowIndex) in activeSheetRows"
                    :key="rowIndex"
                  >
                    <th
                      class="sticky left-0 border bg-slate-50 px-2 py-1 text-right font-medium text-slate-400 dark:border-gray-700 dark:bg-gray-800"
                    >
                      {{ rowIndex + 1 }}
                    </th>
                    <td
                      v-for="(cell, cellIndex) in row"
                      :key="cellIndex"
                      :title="formatCell(cell)"
                      class="max-w-[360px] min-w-[6rem] truncate border px-2 py-1 align-top leading-5 dark:border-gray-700"
                    >
                      {{ formatCell(cell) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </ui-card>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'vue-toastification';
import {
  parseVatExcel,
  parseVatWorkbookPreview,
  createVatModel,
  ParserError,
} from '@/business/tax';
import getFile, { readFileAsBase64 } from '@/utils/getFile';
import {
  loadTaxReportVariables,
  saveTaxReportVariables,
} from '@/utils/taxReportVariables';

const { t, locale } = useI18n();
const toast = useToast();

const reports = ref([]);
const selectedId = ref('');
const parseError = ref('');
const sheets = shallowRef([]);
const model = shallowRef(null);
const activeSheetIndex = ref(0);
const form = reactive({
  label: '',
  path: '',
});

const numberLocale = computed(() =>
  locale.value?.startsWith('zh') ? 'zh-CN' : 'en-US'
);
const selectedReport = computed(() =>
  reports.value.find((item) => item.id === selectedId.value)
);
const activeSheetRows = computed(
  () => sheets.value[activeSheetIndex.value]?.rows || []
);
const metaPreview = computed(() => {
  if (!model.value) return [];
  const m = model.value.meta || {};
  return [
    { label: t('tax.meta.taxpayerName'), value: m.taxpayerName },
    { label: t('tax.meta.taxpayerNo'), value: m.taxpayerNo },
    { label: t('tax.meta.periodRange'), value: m.periodRange },
    { label: t('tax.meta.legalPerson'), value: m.legalPerson },
    { label: t('tax.meta.industry'), value: m.industry },
    { label: t('tax.meta.phone'), value: m.phone },
  ];
});

function makeId() {
  return `tax-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function loadReports() {
  reports.value = await loadTaxReportVariables();
  if (!selectedId.value && reports.value[0]) {
    selectedId.value = reports.value[0].id;
  }
}

async function persistReports(list) {
  await saveTaxReportVariables(list);
  await loadReports();
}

async function addReport() {
  const label = form.label.trim();
  const path = form.path.trim();
  if (!label || !path) {
    toast.error(t('message.noData'));
    return;
  }
  if (reports.value.some((item) => item.label === label)) {
    toast.error(t('popup.duplicateReportName'));
    return;
  }

  const next = [
    ...reports.value,
    {
      id: makeId(),
      label,
      path,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
  await persistReports(next);
  selectedId.value = next[next.length - 1].id;
  form.label = '';
  form.path = '';
}

async function deleteReport(id) {
  const next = reports.value.filter((item) => item.id !== id);
  await persistReports(next);
  if (selectedId.value === id) {
    selectedId.value = next[0]?.id || '';
  }
  sheets.value = [];
  model.value = null;
}

function selectReport(id) {
  selectedId.value = id;
}

async function saveReportParseState(id, patch) {
  const next = reports.value.map((item) =>
    item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item
  );
  await persistReports(next);
}

async function parseReport(item) {
  parseError.value = '';
  sheets.value = [];
  model.value = null;
  activeSheetIndex.value = 0;
  selectedId.value = item.id;

  try {
    const blob = await getFile(item.path, {
      responseType: 'blob',
      returnValue: true,
    });
    const base64 = await readFileAsBase64(blob);
    const [workbookPreview, parsed] = await Promise.all([
      parseVatWorkbookPreview(base64),
      parseVatExcel(base64),
    ]);

    sheets.value = workbookPreview.sheets;
    model.value = createVatModel(parsed);
    await saveReportParseState(item.id, {
      lastParsedAt: Date.now(),
      lastError: '',
    });
    toast.success(t('tax.page.toast.parseOk'));
  } catch (error) {
    const message =
      error instanceof ParserError
        ? t('tax.page.parseFailed', { msg: error.message })
        : error.message || t('tax.page.parseGeneric');
    parseError.value = error.details
      ? `${message}：${JSON.stringify(error.details)}`
      : message;
    await saveReportParseState(item.id, {
      lastError: parseError.value,
    });
  }
}

function formatCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return value.toLocaleString(numberLocale.value, {
      maximumFractionDigits: 6,
    });
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value)
    .replace(/\s*\r?\n\s*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(numberLocale.value);
}

onMounted(loadReports);
</script>
