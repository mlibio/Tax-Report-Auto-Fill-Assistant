<template>
  <aside
    class="fixed left-0 top-0 z-50 flex h-14 w-full items-center border-b border-slate-200 bg-white px-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex items-center">
      <img
        :title="`v${extensionVersion}`"
        src="@/assets/images/logo.png"
        class="mr-3 h-9 w-auto object-contain"
      />
      <div class="hidden leading-tight sm:block">
        <p class="text-sm font-semibold text-slate-900 dark:text-white">
          {{ t('common.productName') }}
        </p>
        <p class="text-xs text-slate-500 dark:text-gray-300">
          {{ t('common.productTagline') }}
        </p>
      </div>
    </div>
    <div
      class="relative ml-6 flex h-full items-center gap-2 text-center"
      @mouseleave="showHoverIndicator = false"
    >
      <div
        v-show="showHoverIndicator"
        ref="hoverIndicator"
        class="absolute top-1/2 h-10 rounded-xl bg-blue-50 transition-transform duration-150"
        style="transform: translate(0, -50%); width: 0"
      ></div>
      <router-link
        v-for="tab in tabs"
        v-slot="{ href, navigate, isActive }"
        :key="tab.id"
        :to="tab.path"
        custom
      >
        <a
          v-tooltip:bottom.group="
            `${t(`common.${tab.id}`, 2)} ${
              tab.shortcut && `(${tab.shortcut.readable})`
            }`
          "
          :class="{ 'is-active': isActive }"
          :href="tab.id === 'log' ? '#' : href"
          class="tab relative z-10 flex h-10 items-center justify-center rounded-xl px-3 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-gray-200 dark:hover:bg-gray-700"
          @click="navigateLink($event, navigate, tab)"
          @mouseenter="hoverHandler"
        >
          <div class="inline-block">
            <v-remixicon :name="tab.icon" />
          </div>
          <span class="ml-2 hidden text-sm font-medium lg:inline">
            {{ t(`common.${tab.id}`, 2) }}
          </span>
          <span
            v-if="tab.id === 'log' && runningWorkflowsLen > 0"
            class="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-xs text-white"
          >
            {{ runningWorkflowsLen }}
          </span>
        </a>
      </router-link>
    </div>
    <div class="grow"></div>
    <button
      v-tooltip:bottom.group="$t('home.elementSelector.name')"
      class="mr-3 rounded-xl bg-yellow-100 px-3 py-2 text-yellow-700 transition hover:bg-yellow-200 focus:ring-0"
      @click="injectElementSelector"
    >
      <v-remixicon name="riFocus3Line" />
    </button>
    <div
      class="mr-3 hidden rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 md:block"
    >
      本地
    </div>
    <router-link
      v-tooltip:bottom.group="t('settings.menu.about')"
      to="/about"
      class="rounded-xl bg-slate-100 px-3 py-2 text-slate-600 transition hover:bg-slate-200 dark:bg-gray-700 dark:text-gray-200"
    >
      <v-remixicon class="cursor-pointer" name="riInformationLine" />
    </router-link>
  </aside>
</template>
<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import browser from 'webextension-polyfill';
import { useWorkflowStore } from '@/stores/workflow';
import { useShortcut, getShortcut } from '@/composable/shortcut';
import { useGroupTooltip } from '@/composable/groupTooltip';
import { initElementSelector } from '@/newtab/utils/elementSelector';
import emitter from '@/lib/mitt';

useGroupTooltip();

const { t } = useI18n();
const toast = useToast();
const router = useRouter();
const workflowStore = useWorkflowStore();

const extensionVersion = browser.runtime.getManifest().version;
const tabs = [
  {
    id: 'workflow',
    icon: 'riFlowChart',
    path: '/workflows',
    shortcut: getShortcut('page:workflows', '/workflows'),
  },
  {
    id: 'schedule',
    icon: 'riTimeLine',
    path: '/schedule',
    shortcut: getShortcut('page:schedule', '/triggers'),
  },
  {
    id: 'storage',
    icon: 'riHardDrive2Line',
    path: '/storage',
    shortcut: getShortcut('page:storage', '/storage'),
  },
  {
    id: 'taxFiling',
    icon: 'riFileList3Line',
    path: '/tax-data',
    shortcut: getShortcut('page:tax-data', '/tax-data'),
  },
  {
    id: 'log',
    icon: 'riHistoryLine',
    path: '/logs',
    shortcut: getShortcut('page:logs', '/logs'),
  },
  {
    id: 'settings',
    icon: 'riSettings3Line',
    path: '/settings',
    shortcut: getShortcut('page:settings', '/settings'),
  },
];
const hoverIndicator = ref(null);
const showHoverIndicator = ref(false);
const runningWorkflowsLen = computed(() => workflowStore.getAllStates.length);

useShortcut(
  tabs.reduce((acc, { shortcut }) => {
    if (shortcut) {
      acc.push(shortcut);
    }

    return acc;
  }, []),
  ({ data }) => {
    if (!data) return;

    if (data.includes('/logs')) {
      emitter.emit('ui:logs', { show: true });
      return;
    }

    router.push(data);
  }
);

function navigateLink(event, navigateFn, tab) {
  event.preventDefault();

  if (tab.id === 'log') {
    emitter.emit('ui:logs', { show: true });
  } else {
    navigateFn();
  }
}
function hoverHandler({ currentTarget }) {
  showHoverIndicator.value = true;
  hoverIndicator.value.style.width = `${currentTarget.offsetWidth}px`;
  hoverIndicator.value.style.transform = `translate(${currentTarget.offsetLeft}px, -50%)`;
}
async function injectElementSelector() {
  try {
    const [tab] = await browser.tabs.query({ active: true, url: '*://*/*' });
    if (!tab) {
      toast.error(t('home.elementSelector.noAccess'));
      return;
    }

    await initElementSelector();
  } catch (error) {
    console.error(error);
  }
}
</script>
<style scoped>
.tab.is-active {
  @apply bg-blue-600 text-white shadow-sm hover:bg-blue-600 hover:text-white;
}
</style>
