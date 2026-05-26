<template>
  <template v-if="retrieved">
    <app-sidebar v-if="$route.name !== 'recording' && !hideChromeNav" />
    <main
      :class="{
        'pt-14': $route.name !== 'recording' && !hideChromeNav,
      }"
    >
      <router-view />
    </main>
    <app-logs />
    <ui-dialog />
    <shared-permissions-modal
      v-model="permissionState.showModal"
      :permissions="permissionState.items"
    />
  </template>
  <div v-else class="py-8 text-center">
    <ui-spinner color="text-accent" size="28" />
  </div>
</template>
<script setup>
import iconLogo from '@/assets/images/logo.png';
import AppLogs from '@/components/newtab/app/AppLogs.vue';
import AppSidebar from '@/components/newtab/app/AppSidebar.vue';
import SharedPermissionsModal from '@/components/newtab/shared/SharedPermissionsModal.vue';
import { useTheme } from '@/composable/theme';
import dbLogs from '@/db/logs';
import dayjs from '@/lib/dayjs';
import emitter from '@/lib/mitt';
import { loadLocaleMessages, setI18nLanguage } from '@/lib/vueI18n';
import { seedBuiltinTaxWorkflows } from '@/business/tax/seed';
import { useFolderStore } from '@/stores/folder';
import { useStore } from '@/stores/main';
import { useWorkflowStore } from '@/stores/workflow';
import dataMigration from '@/utils/dataMigration';
import { MessageListener } from '@/utils/message';
import { getWorkflowPermissions } from '@/utils/workflowData';
import automa from '@business';
import { useHead } from '@vueuse/head';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import browser from 'webextension-polyfill';

const iconElement = document.createElement('link');
iconElement.rel = 'icon';
iconElement.href = iconLogo;
document.head.appendChild(iconElement);

window.fromBackground = window.location.href.includes('?fromBackground=true');

const { t } = useI18n();
const route = useRoute();
const hideChromeNav = computed(
  () => route.name === 'workflows-details' && route.query.compact === '1'
);
const store = useStore();
const theme = useTheme();
const router = useRouter();
const folderStore = useFolderStore();
const workflowStore = useWorkflowStore();

theme.init();

const retrieved = ref(false);
const permissionState = reactive({
  permissions: [],
  showModal: false,
});

const currentVersion = browser.runtime.getManifest().version;
/* eslint-disable-next-line */
function autoDeleteLogs() {
  const deleteAfter = store.settings.deleteLogAfter;
  if (deleteAfter === 'never') return;

  const lastCheck =
    +localStorage.getItem('checkDeleteLogs') || Date.now() - 8.64e7;
  const dayDiff = dayjs().diff(dayjs(lastCheck), 'day');

  if (dayDiff < 1) return;

  const aDayInMs = 8.64e7;
  const maxLogAge = Date.now() - aDayInMs * deleteAfter;

  dbLogs.items
    .where('endedAt')
    .below(maxLogAge)
    .toArray()
    .then((values) => {
      const ids = values.map(({ id }) => id);

      dbLogs.items.bulkDelete(ids);
      dbLogs.ctxData.where('logId').anyOf(ids).delete();
      dbLogs.logsData.where('logId').anyOf(ids).delete();
      dbLogs.histories.where('logId').anyOf(ids).delete();

      localStorage.setItem('checkDeleteLogs', Date.now());
    });
}
function stopRecording() {
  if (!window.stopRecording) return;

  window.stopRecording();
}

const messageEvents = {
  'refresh-packages': function () {
    // Package sharing is disabled in the local-only build.
  },
  'open-logs': function (data) {
    emitter.emit('ui:logs', {
      show: true,
      logId: data.logId,
    });
  },
  'workflow:added': function (data) {
    if (data.source === 'team') {
      router.push('/workflows');
    } else if (data.workflowData) {
      workflowStore
        .insert(data.workflowData, { duplicateId: true })
        .then(async () => {
          try {
            const permissions = await getWorkflowPermissions(data.workflowData);
            if (permissions.length === 0) return;

            permissionState.items = permissions;
            permissionState.showModal = true;
          } catch (error) {
            console.error(error);
          }
        })
        .catch((error) => {
          console.error(error);
        });
    }
  },
  'recording:stop': stopRecording,
  'background--recording:stop': stopRecording,
};

browser.runtime.onMessage.addListener(({ type, data }) => {
  if (!type || !messageEvents[type]) return;

  messageEvents[type](data);
});

browser.storage.local.onChanged.addListener(({ workflowStates }) => {
  if (!workflowStates) return;
  const states = Object.values(workflowStates.newValue);
  workflowStore.states = states;
});

useHead(() => {
  const runningWorkflows = workflowStore.popupStates.length;

  return {
    title: '工作台',
    titleTemplate:
      runningWorkflows > 0
        ? `%s（${runningWorkflows} 个运行中）- 税务自动填报助手`
        : '%s - 税务自动填报助手',
  };
});

/* eslint-disable-next-line */
window.onbeforeunload = () => {
  const runningWorkflows = workflowStore.popupStates.length;
  if (window.isDataChanged || runningWorkflows > 0) {
    return t('message.notSaved');
  }
};
window.addEventListener('message', ({ data }) => {
  if (data?.type !== 'automa-fetch') return;

  const sendResponse = (result) => {
    const sandbox = document.getElementById('sandbox');
    sandbox.contentWindow.postMessage(
      {
        type: 'fetchResponse',
        data: result,
        id: data.data.id,
      },
      '*'
    );
  };

  MessageListener.sendMessage('fetch', data.data, 'background')
    .then((result) => {
      sendResponse({ isError: false, result });
    })
    .catch((error) => {
      sendResponse({ isError: true, result: error.message });
    });
});

watch(
  () => workflowStore.popupStates,
  () => {
    if (
      !window.fromBackground ||
      workflowStore.popupStates.length !== 0 ||
      route.name !== 'workflows'
    )
      return;

    window.close();
  }
);

(async () => {
  try {
    const { workflowStates } = await browser.storage.local.get(
      'workflowStates'
    );
    workflowStore.states = Object.values(workflowStates || {});

    const tabs = await browser.tabs.query({
      url: browser.runtime.getURL('/newtab.html'),
    });

    const currentWindow = await browser.windows.getCurrent();
    if (currentWindow.type !== 'popup') {
      await browser.tabs.remove([tabs[0].id]);
      return;
    }

    if (tabs.length > 1) {
      const firstTab = tabs.shift();
      await browser.windows.update(firstTab.windowId, { focused: true });
      await browser.tabs.update(firstTab.id, { active: true });

      await browser.tabs.remove(tabs.map((tab) => tab.id));
      return;
    }

    await Promise.allSettled([
      folderStore.load(),
      store.loadSettings(),
      workflowStore.loadData(),
    ]);
    await seedBuiltinTaxWorkflows(workflowStore);
    await browser.storage.local.remove([
      'session',
      'sessionToken',
      'user',
      'backupIds',
      'lastBackup',
    ]);

    await loadLocaleMessages(store.settings.locale, 'newtab');
    await setI18nLanguage(store.settings.locale);

    await dataMigration();
    await automa('app');

    retrieved.value = true;

    const { isRecording } = await browser.storage.local.get('isRecording');
    if (isRecording) {
      router.push('/recording');

      await (browser.action || browser.browserAction).setBadgeBackgroundColor({
        color: '#ef4444',
      });
      await (browser.action || browser.browserAction).setBadgeText({
        text: 'rec',
      });
    }

    autoDeleteLogs();
  } catch (error) {
    retrieved.value = true;
    console.error(error);
  }

  localStorage.setItem('ext-version', currentVersion);
})();
</script>
<style>
html,
body {
  @apply bg-gray-50 dark:bg-gray-900 text-black dark:text-gray-100;
}

body {
  min-height: 100vh;
}

#app {
  height: 100%;
}

h1,
h2,
h3 {
  @apply dark:text-white;
}
</style>
