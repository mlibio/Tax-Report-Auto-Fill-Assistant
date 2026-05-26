<template>
  <template v-if="retrieved">
    <router-view />
    <ui-dialog />
  </template>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import browser from 'webextension-polyfill';
import { useStore } from '@/stores/main';
import { sendMessage } from '@/utils/message';
import { useWorkflowStore } from '@/stores/workflow';
import { loadLocaleMessages, setI18nLanguage } from '@/lib/vueI18n';

const store = useStore();
const workflowStore = useWorkflowStore();

const retrieved = ref(false);

browser.storage.local.get('isRecording').then(({ isRecording }) => {
  if (!isRecording) return;

  sendMessage('open:dashboard', '/recording', 'background').then(() => {
    window.close();
  });
});

onMounted(async () => {
  try {
    await store.loadSettings();
    await loadLocaleMessages(store.settings.locale, 'popup');
    await setI18nLanguage(store.settings.locale);

    await workflowStore.loadData();

    retrieved.value = true;
  } catch (error) {
    console.error(error);
    retrieved.value = true;
  }
});
</script>
<style>
body {
  width: 300px;
  min-height: 360px;
  max-height: 520px;
  overflow-x: hidden;
  overflow-y: auto;
  font-size: 13px;
}

.Vue-Toastification__container {
  left: 8px !important;
  right: 8px !important;
  top: 8px !important;
  width: auto !important;
  min-width: 0 !important;
}

.Vue-Toastification__toast {
  min-width: 0 !important;
  max-width: calc(100vw - 16px) !important;
}
</style>
