<template>
  <ui-expand
    hide-header-icon
    header-class="workflow-block-category flex items-center rounded-xl px-3 py-2 focus:ring-0 w-full text-left text-slate-700 dark:text-gray-200"
  >
    <template #header="{ show }">
      <span
        :class="category.color"
        class="h-3 w-3 rounded-full ring-4 ring-white dark:ring-gray-900"
      ></span>
      <p class="ml-3 flex-1 text-sm font-semibold capitalize">
        {{ category.name }}
      </p>
      <v-remixicon :name="show ? 'riSubtractLine' : 'riAddLine'" size="20" />
    </template>
    <div class="mb-4 grid grid-cols-1 gap-2 px-1 xl:grid-cols-2">
      <div
        v-for="block in blocks"
        :key="block.id"
        :title="getBlockTitle(block)"
        draggable="true"
        class="workflow-block-item group relative cursor-move select-none rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
        @dragstart="$event.dataTransfer.setData('block', JSON.stringify(block))"
      >
        <div
          class="invisible absolute right-2 top-2 flex items-center text-slate-500 group-hover:visible dark:text-gray-300"
        >
          <span :title="getBlockTitle(block)">
            <v-remixicon name="riInformationLine" size="18" />
          </span>
          <span
            :title="`${pinned.includes(block.id) ? 'Unpin' : 'Pin'} block`"
            class="ml-1 cursor-pointer"
            @click="$emit('pin', block)"
          >
            <v-remixicon
              size="18"
              :name="
                pinned.includes(block.id) ? 'riPushpin2Fill' : 'riPushpin2Line'
              "
            />
          </span>
        </div>
        <img
          v-if="block.icon.startsWith('http')"
          :src="block.icon"
          alt=""
          width="24"
          class="mb-2 dark:invert"
        />
        <v-remixicon
          v-else
          :path="getIconPath(block.icon)"
          :name="block.icon"
          size="22"
          class="mb-2 text-blue-600"
        />
        <p
          class="text-overflow text-sm font-medium capitalize leading-tight text-slate-800 dark:text-gray-100"
        >
          {{ block.name }}
        </p>
        <div
          v-if="block.tag"
          class="flex items-center justify-center absolute top-0 right-0 min-w-[52px] h-[22px] group-hover:invisible rounded-tr-lg rounded-bl-[22px] rounded-tl-0 rounded-br-0 bg-[#79FFEB] dark:bg-[#2DD4BF] text-sm font-semibold dark:text-gray-900"
        >
          {{ block.tag }}
        </div>
      </div>
    </div>
  </ui-expand>
</template>
<script setup>
import { getBlocks } from '@/utils/getSharedData';
import { useI18n } from 'vue-i18n';

defineProps({
  category: {
    type: Object,
    default: () => ({}),
  },
  blocks: {
    type: Array,
    default: () => [],
  },
  pinned: {
    type: Array,
    default: () => [],
  },
});
defineEmits(['pin']);

const { t, te } = useI18n();
const blocksDetail = getBlocks();

function getBlockTitle({ description, id, name }) {
  const blockPath = `workflow.blocks.${id}`;
  if (!te(blockPath)) return blocksDetail[id].name;

  const descPath = `${blockPath}.${description ? 'description' : 'name'}`;
  let blockDescription = te(descPath) ? t(descPath) : name;

  if (description) {
    blockDescription = `[${t(`${blockPath}.name`)}]\n${blockDescription}`;
  }

  return blockDescription;
}
function getIconPath(path) {
  if (path && path.startsWith('path')) {
    const { 1: iconPath } = path.split(':');
    return iconPath;
  }

  return '';
}
</script>
