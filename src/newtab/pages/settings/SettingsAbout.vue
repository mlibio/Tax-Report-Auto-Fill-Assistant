<template>
  <div class="max-w-lg">
    <div class="bg-box-transparent mb-2 inline-block rounded-full p-3">
      <img src="@/assets/images/logo.png" class="h-14 w-auto object-contain" />
    </div>
    <p class="text-2xl font-semibold">税务自动填报助手</p>
    <p class="mb-2 mt-1">版本：{{ extensionVersion }}</p>
    <p class="text-gray-600 dark:text-gray-200">
      在浏览器中本地运行的税务报表自动填报辅助扩展。工作流与日志仅保存在当前浏览器配置中。
    </p>
    <div class="my-8 border-b dark:border-gray-700"></div>
    <h2 class="text-xl font-semibold">仅本地模式</h2>
    <p class="mt-1 text-gray-600 dark:text-gray-200">
      已关闭账号登录、云端同步、共享工作流、市场浏览、Google 集成、Webhook
      与工作流远程 HTTP 事件等联网能力。
    </p>
  </div>
</template>
<script setup>
import browser from 'webextension-polyfill';

const extensionVersion = browser.runtime.getManifest().version;
</script>
