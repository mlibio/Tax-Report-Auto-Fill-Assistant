<template>
  <div
    class="popup-logs flex max-h-44 flex-col rounded-lg border border-slate-200 bg-white"
  >
    <div
      class="flex items-center gap-1 border-b border-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
    >
      <span class="flex-1">{{ t('popup.logs.title') }}</span>
      <ui-button
        small
        class="!px-1.5 !py-0.5 text-[10px]"
        @click="exportLogs('json')"
      >
        {{ t('popup.logs.exportJson') }}
      </ui-button>
      <ui-button
        small
        class="!px-1.5 !py-0.5 text-[10px]"
        @click="exportLogs('csv')"
      >
        {{ t('popup.logs.exportCsv') }}
      </ui-button>
      <ui-button
        variant="danger"
        small
        class="!px-1.5 !py-0.5 text-[10px]"
        :disabled="selected.length === 0"
        @click="deleteSelected"
      >
        {{ t('log.deleteSelected') }}
      </ui-button>
    </div>
    <div class="scroll max-h-36 overflow-y-auto text-xs">
      <table class="w-full">
        <tbody class="divide-y divide-slate-100">
          <tr
            v-for="log in displayLogs"
            :key="log.id"
            class="cursor-pointer hover:bg-slate-50"
            @click="openLogDetails(log.id)"
          >
            <td class="w-6 pl-1" @click.stop>
              <ui-checkbox
                :model-value="selected.includes(log.id)"
                class="scale-90"
                @change="toggleSel($event, log.id)"
              />
            </td>
            <td class="max-w-[120px] truncate px-1 py-1" :title="log.name">
              {{ log.name }}
            </td>
            <td class="whitespace-nowrap px-1 py-1 text-center">
              <span
                class="rounded px-1 py-0.5 text-[10px] font-medium"
                :class="statusClass(log.status)"
              >
                {{ t(`logStatus.${log.status}`, log.status) }}
              </span>
            </td>
            <td class="px-1 py-1 text-right">
              <button
                type="button"
                class="text-red-500"
                @click.stop="deleteOne(log.id)"
              >
                <v-remixicon name="riDeleteBin6Line" size="16" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-if="!displayLogs.length"
        class="px-3 py-4 text-center text-slate-400"
      >
        {{ t('popup.logs.empty') }}
      </p>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDialog } from '@/composable/dialog';
import { useLiveQuery } from '@/composable/liveQuery';
import BackgroundUtils from '@/background/BackgroundUtils';
import dbLogs from '@/db/logs';
import dataExporter from '@/utils/dataExporter';

const { t } = useI18n();
const dialog = useDialog();
const stored = useLiveQuery(() => dbLogs.items.toArray());
const selected = ref([]);

const displayLogs = computed(() => {
  if (!stored.value) return [];
  return [...stored.value]
    .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))
    .slice(0, 30);
});

watch(displayLogs, (rows) => {
  const ids = new Set(rows.map((r) => r.id));
  selected.value = selected.value.filter((id) => ids.has(id));
});

function statusClass(status) {
  if (status === 'error') return 'bg-red-100 text-red-700';
  if (status === 'stopped') return 'bg-amber-100 text-amber-800';
  return 'bg-emerald-100 text-emerald-800';
}

function toggleSel(on, id) {
  if (on) {
    if (!selected.value.includes(id)) selected.value = [...selected.value, id];
  } else {
    selected.value = selected.value.filter((x) => x !== id);
  }
}

function deleteOne(id) {
  dialog.confirm({
    title: t('log.delete.title'),
    okVariant: 'danger',
    body: t('log.delete.description'),
    onConfirm: () => {
      dbLogs.items.delete(id).then(() => {
        dbLogs.ctxData.where('logId').equals(id).delete();
        dbLogs.histories.where('logId').equals(id).delete();
        dbLogs.logsData.where('logId').equals(id).delete();
      });
    },
  });
}

function deleteSelected() {
  if (!selected.value.length) return;
  const ids = [...selected.value];
  dialog.confirm({
    title: t('log.delete.title'),
    okVariant: 'danger',
    body: t('log.delete.description'),
    onConfirm: () => {
      dbLogs.items.bulkDelete(ids).then(() => {
        ids.forEach((id) => {
          dbLogs.ctxData.where('logId').equals(id).delete();
          dbLogs.histories.where('logId').equals(id).delete();
          dbLogs.logsData.where('logId').equals(id).delete();
        });
        selected.value = [];
      });
    },
  });
}

function openLogDetails(id) {
  BackgroundUtils.openDashboard(`/logs/${id}`);
}

async function exportLogs(type) {
  const ids =
    selected.value.length > 0
      ? selected.value
      : displayLogs.value.map(({ id }) => id);
  if (!ids.length) return;

  const [items, histories, dataRows, ctxRows] = await Promise.all([
    dbLogs.items.where('id').anyOf(ids).toArray(),
    dbLogs.histories.where('logId').anyOf(ids).toArray(),
    dbLogs.logsData.where('logId').anyOf(ids).toArray(),
    dbLogs.ctxData.where('logId').anyOf(ids).toArray(),
  ]);
  const getRowData = (rows, logId) =>
    rows.find((item) => item.logId === logId)?.data ?? null;

  const payload = items.map((item) => ({
    ...item,
    history: getRowData(histories, item.id),
    data: getRowData(dataRows, item.id),
    context: getRowData(ctxRows, item.id),
  }));
  const exportPayload =
    type === 'csv'
      ? payload.map(({ history, data, context, errorDetails, ...summary }) => ({
          ...summary,
          historyCount: history?.length || 0,
          hasData: Boolean(data),
          hasContext: Boolean(context),
          errorDetails: errorDetails ? JSON.stringify(errorDetails) : '',
        }))
      : payload;

  dataExporter(
    exportPayload,
    {
      name: `tax-logs-${new Date().toISOString().slice(0, 10)}`,
      type,
      addBOMHeader: true,
    },
    true
  );
}
</script>
