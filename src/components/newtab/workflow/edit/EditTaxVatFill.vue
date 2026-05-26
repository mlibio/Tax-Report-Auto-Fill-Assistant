<template>
  <div>
    <ui-textarea
      :model-value="data.description"
      :placeholder="t('common.description')"
      class="mb-2 w-full"
      @change="updateData({ description: $event })"
    />
    <ui-input
      :model-value="data.modelVariable"
      label="数据模型变量"
      placeholder="vatModel"
      class="mb-3 w-full"
      @change="updateData({ modelVariable: $event })"
    />
    <ui-input
      :model-value="data.reportVariable"
      label="校验报告变量"
      placeholder="vatValidationReport"
      class="mb-3 w-full"
      @change="updateData({ reportVariable: $event })"
    />
    <ui-checkbox
      :model-value="data.skipOptional"
      class="mb-2"
      @change="updateData({ skipOptional: $event })"
    >
      跳过空值的可选字段
    </ui-checkbox>
    <ui-input
      :model-value="data.delayBetweenFields"
      type="number"
      label="字段之间的延迟（毫秒）"
      class="w-full"
      @change="updateData({ delayBetweenFields: Number($event) || 0 })"
    />
    <p class="mt-2 text-xs text-slate-500 dark:text-gray-400">
      该节点会按内置字段映射，在当前活动 Tab 中找到对应输入框并填写。
      关键字段缺失会触发软门禁报错。
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
