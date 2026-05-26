<template>
  <div>
    <ui-textarea
      :model-value="data.description"
      :placeholder="t('common.description')"
      class="mb-2 w-full"
      @change="updateData({ description: $event })"
    />
    <label class="input-label">数据来源</label>
    <ui-select
      :model-value="data.source"
      class="mb-3 w-full"
      @change="updateData({ source: $event })"
    >
      <option value="globalData">从工作流全局数据读取（base64）</option>
      <option value="variable">从变量读取（base64）</option>
      <option value="variablePath">从变量读取文件路径</option>
      <option value="filePath">从文件路径读取</option>
    </ui-select>

    <ui-input
      v-if="data.source === 'globalData'"
      :model-value="data.globalDataKey"
      label="全局数据键"
      class="mb-3 w-full"
      placeholder="vatExcelBase64"
      @change="updateData({ globalDataKey: $event })"
    />
    <ui-input
      v-else-if="data.source === 'variable'"
      :model-value="data.variableKey"
      label="变量名"
      class="mb-3 w-full"
      placeholder="vatExcelBase64"
      @change="updateData({ variableKey: $event })"
    />
    <ui-input
      v-else-if="data.source === 'variablePath'"
      :model-value="data.variableKey"
      label="文件路径变量名"
      class="mb-3 w-full"
      placeholder="TaxFilePath"
      @change="updateData({ variableKey: $event })"
    />
    <ui-input
      v-else
      :model-value="data.filePath"
      label="文件路径"
      class="mb-3 w-full"
      placeholder="C:\\path\\to\\file.xls"
      @change="updateData({ filePath: $event })"
    />

    <ui-input
      :model-value="data.outputVariable"
      label="输出变量名"
      placeholder="vatModel"
      class="w-full"
      @change="updateData({ outputVariable: $event })"
    />
    <p class="mt-2 text-xs text-slate-500 dark:text-gray-400">
      解析结果会写入指定的工作流变量，供「数据校验」与「自动填报」节点使用。
    </p>
  </div>
</template>
<script setup>
import { useI18n } from 'vue-i18n';

const props = defineProps({
  data: {
    type: Object,
    default: () => ({}),
  },
});
const emit = defineEmits(['update:data']);

const { t } = useI18n();

function updateData(value) {
  emit('update:data', { ...props.data, ...value });
}
</script>
