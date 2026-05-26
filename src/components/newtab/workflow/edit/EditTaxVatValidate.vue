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
    <label class="input-label">门禁模式</label>
    <ui-select
      :model-value="data.gateMode"
      class="mb-3 w-full"
      @change="updateData({ gateMode: $event })"
    >
      <option value="soft">软门禁（默认拦截，允许人工覆盖）</option>
      <option value="hard">硬门禁（任何错误都终止流程）</option>
    </ui-select>
    <ui-checkbox
      :model-value="data.allowOverride"
      class="mb-1"
      @change="updateData({ allowOverride: $event })"
    >
      允许覆盖（已经在仪表板勾选「确认风险并继续」时放行）
    </ui-checkbox>
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
