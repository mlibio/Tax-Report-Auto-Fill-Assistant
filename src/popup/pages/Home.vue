<template>
  <div class="flex min-h-full flex-col bg-slate-50 p-2 text-slate-900">
    <header class="mb-2 flex shrink-0 items-center gap-2">
      <img src="@/assets/images/logo.png" alt="" class="h-8 w-auto shrink-0 object-contain" />
      <div class="min-w-0 flex-1 leading-tight">
        <h1 class="truncate text-sm font-bold">
          {{ t('common.productName') }}
        </h1>
        <p class="truncate text-[10px] text-slate-500">
          {{ t('common.productTagline') }}
        </p>
      </div>
      <button
        type="button"
        class="rounded-full p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
        :title="t('popup.settings')"
        @click="openDashboard('/settings')"
      >
        <v-remixicon name="riSettings3Line" size="18" />
      </button>
    </header>

    <section
      class="mb-2 shrink-0 rounded-lg border border-slate-200 bg-white p-2"
    >
      <h2 class="mb-1.5 text-xs font-bold text-blue-600">
        {{ t('popup.dataPrep') }}
      </h2>
      <div class="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          class="prep-btn bg-blue-600"
          @click="openReportModal"
        >
          {{ t('popup.importReport') }}
        </button>
        <button
          type="button"
          class="prep-btn bg-emerald-600"
          @click="openDashboard('/workflows')"
        >
          {{ t('popup.workflowManage') }}
        </button>
        <button
          type="button"
          class="prep-btn bg-amber-500"
          @click="openDashboard('/tax-data')"
        >
          {{ t('popup.dataManage') }}
        </button>
      </div>

      <ul
        v-if="reportVars.length"
        class="mt-2 max-h-16 space-y-1 overflow-y-auto border-t border-slate-100 pt-1.5"
      >
        <li
          v-for="row in reportVars"
          :key="row.id"
          class="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px]"
        >
          <span class="min-w-0 flex-1 truncate" :title="row.path">
            <b>{{ row.label }}</b>
          </span>
          <button
            type="button"
            class="shrink-0 text-red-600"
            :title="t('popup.removeVar')"
            @click="removeReportVar(row.id)"
          >
            <v-remixicon name="riCloseLine" size="14" />
          </button>
        </li>
      </ul>
    </section>

    <section
      class="mb-2 shrink-0 rounded-lg border border-slate-200 bg-white p-2"
    >
      <h2 class="mb-1.5 text-xs font-bold text-emerald-700">
        {{ t('popup.execute') }}
      </h2>
      <div class="grid grid-cols-[1fr_1fr_auto] items-stretch gap-1">
        <ui-select v-model="execState.reportId" class="min-w-0 text-xs">
          <option value="">{{ t('popup.selectReportVar') }}</option>
          <option v-for="row in reportVars" :key="row.id" :value="row.id">
            {{ row.label }}
          </option>
        </ui-select>
        <ui-select v-model="execState.workflowId" class="min-w-0 text-xs">
          <option value="">{{ t('popup.selectWorkflow') }}</option>
          <option
            v-for="w in sortedWorkflows"
            :key="w.id"
            :value="w.id"
          >
            {{ w.name }}
          </option>
        </ui-select>
        <button
          type="button"
          class="rounded-md bg-emerald-600 px-2.5 text-xs font-bold text-white hover:bg-emerald-700"
          @click="runWorkflow"
        >
          {{ t('popup.executeWorkflow') }}
        </button>
      </div>
      <p class="mt-1 text-[10px] text-slate-400">
        {{ t('popup.taxFilePathHint') }}
      </p>
    </section>

    <section class="min-h-0 flex-1">
      <popup-logs-panel />
    </section>

    <ui-modal v-model="reportModal.open" :title="t('popup.reportModalTitle')">
      <div class="space-y-3 p-1">
        <ui-input
          v-model="reportModal.label"
          :label="t('popup.reportName')"
          placeholder="5月增值税申报表"
        />
        <ui-input
          v-model="reportModal.path"
          :label="t('popup.reportFilePath')"
          placeholder="D:\税务\报表.xls"
        />
        <div class="flex justify-end gap-2 pt-2">
          <ui-button @click="reportModal.open = false">
            {{ t('common.cancel') }}
          </ui-button>
          <ui-button
            class="bg-blue-600 text-white hover:bg-blue-700"
            @click="saveReportVariable"
          >
            {{ t('popup.reportSave') }}
          </ui-button>
        </div>
      </div>
    </ui-modal>
  </div>
</template>
<script setup>
import PopupLogsPanel from '@/components/popup/PopupLogsPanel.vue';
import BackgroundUtils from '@/background/BackgroundUtils';
import RendererWorkflowService from '@/service/renderer/RendererWorkflowService';
import { useWorkflowStore } from '@/stores/workflow';
import {
  loadTaxReportVariables,
  saveTaxReportVariables,
} from '@/utils/taxReportVariables';
import automa from '@business';
import { customAlphabet } from 'nanoid';
import { computed, onMounted, reactive, ref, watch, toRaw } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'vue-toastification';
import browser from 'webextension-polyfill';

/** Last report variable + workflow chosen in popup execute section */
const POPUP_EXEC_PREFS_KEY = 'popupExecLastSelection';

const { t } = useI18n();
const toast = useToast();
const workflowStore = useWorkflowStore();
const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 8);

const reportVars = ref([]);
const execState = reactive({
  reportId: '',
  workflowId: '',
});

const reportModal = reactive({
  open: false,
  label: '',
  path: '',
});

let execPrefsHydrated = false;

/** Workflows sorted by creation time, newest first */
const sortedWorkflows = computed(() =>
  [...workflowStore.getWorkflows].sort(
    (a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)
  )
);

async function loadPopupExecPrefs() {
  const { [POPUP_EXEC_PREFS_KEY]: raw } = await browser.storage.local.get(
    POPUP_EXEC_PREFS_KEY
  );
  return raw && typeof raw === 'object' ? raw : {};
}

async function persistPopupExecPrefs() {
  if (!execPrefsHydrated) return;
  await browser.storage.local.set({
    [POPUP_EXEC_PREFS_KEY]: {
      reportId: execState.reportId || '',
      workflowId: execState.workflowId || '',
    },
  });
}

async function refreshReportVars() {
  reportVars.value = await loadTaxReportVariables();
}

function ensureReportSelection() {
  if (!reportVars.value.length) {
    execState.reportId = '';
    return;
  }
  if (
    !execState.reportId ||
    !reportVars.value.some((r) => r.id === execState.reportId)
  ) {
    execState.reportId = reportVars.value[0].id;
  }
}

watch(reportVars, ensureReportSelection);

function ensureWorkflowSelection() {
  const workflows = sortedWorkflows.value;
  if (!workflows.length) return;

  if (
    !execState.workflowId ||
    !workflows.some((workflow) => workflow.id === execState.workflowId)
  ) {
    execState.workflowId = workflows[0].id;
  }
}

watch(
  () => workflowStore.getWorkflows.map((workflow) => workflow.id).join('|'),
  () => {
    ensureWorkflowSelection();
  }
);

watch(
  () => [execState.reportId, execState.workflowId],
  () => {
    persistPopupExecPrefs();
  }
);

function openDashboard(url) {
  BackgroundUtils.openDashboard(url);
}

function openReportModal() {
  reportModal.label = '';
  reportModal.path = '';
  reportModal.open = true;
}

function isExcelReportPath(path) {
  return /\.xlsx?$/i.test(path);
}

async function saveReportVariable() {
  const label = (reportModal.label || '').trim();
  const path = (reportModal.path || '').trim();
  if (!label || !path) {
    toast.error(t('message.noData'));
    return;
  }

  const list = await loadTaxReportVariables();
  if (list.some((r) => r.label === label)) {
    toast.error(t('popup.duplicateReportName'));
    return;
  }
  if (!isExcelReportPath(path)) {
    toast.error(t('popup.invalidReportFileType'));
    return;
  }
  list.push({
    id: nanoid(),
    label,
    path,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await saveTaxReportVariables(list);
  await refreshReportVars();
  // Select the newly added report (now first after desc sort)
  execState.reportId = reportVars.value[0]?.id || '';
  reportModal.open = false;
}

async function removeReportVar(id) {
  const list = (await loadTaxReportVariables()).filter((r) => r.id !== id);
  await saveTaxReportVariables(list);
  await refreshReportVars();
}

async function runWorkflow() {
  if (!execState.workflowId || !workflowStore.getById(execState.workflowId)) {
    await workflowStore.loadData();
    ensureWorkflowSelection();
  }

  if (!execState.workflowId) {
    toast.error(t('popup.needWorkflow'));
    return;
  }

  const selected = reportVars.value.find((r) => r.id === execState.reportId);
  const wf = workflowStore.getById(execState.workflowId);
  if (!wf) {
    toast.error(t('popup.needWorkflow'));
    return;
  }

  const rawWf = toRaw(wf);
  const prevOpts = rawWf.options || {};
  const prevData = prevOpts.data || {};
  const prevVariables = prevData.variables || {};
  const reportVariables = selected
    ? { param0: selected.path }
    : {};

  try {
    await RendererWorkflowService.executeWorkflow(
      { ...rawWf, includeTabId: true },
      {
        ...prevOpts,
        data: {
          ...prevData,
          variables: {
            ...prevVariables,
            ...reportVariables,
          },
        },
      }
    );
  } catch (error) {
    console.error(error);
    toast.error(t('message.somethingWrong'));
  }
}

onMounted(async () => {
  await automa('app');
  await workflowStore.loadData();
  await refreshReportVars();

  const prefs = await loadPopupExecPrefs();
  const reportList = reportVars.value;
  const workflows = sortedWorkflows.value;

  if (
    prefs.reportId &&
    reportList.some((r) => r.id === prefs.reportId)
  ) {
    execState.reportId = prefs.reportId;
  }
  if (
    prefs.workflowId &&
    workflows.some((w) => w.id === prefs.workflowId)
  ) {
    execState.workflowId = prefs.workflowId;
  }

  ensureReportSelection();
  ensureWorkflowSelection();
  execPrefsHydrated = true;
  await persistPopupExecPrefs();
});
</script>
<style scoped>
.prep-btn {
  @apply rounded-md py-2 text-xs font-semibold text-white shadow-sm hover:brightness-95;
}
</style>
