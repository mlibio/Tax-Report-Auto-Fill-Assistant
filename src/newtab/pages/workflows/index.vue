<template>
  <div class="container pt-8 pb-4">
    <h1 class="text-2xl font-semibold capitalize">
      {{ t('common.workflow', 2) }}
    </h1>
    <div class="mt-8 flex items-start">
      <div class="sticky top-8 hidden w-60 lg:block">
        <div class="flex w-full">
          <ui-button
            :title="shortcut['action:new'].readable"
            variant="accent"
            class="flex-1 rounded-r-none border-r font-semibold"
            @click="addWorkflowModal.show = true"
          >
            {{ t('workflow.new') }}
          </ui-button>
          <ui-popover>
            <template #trigger>
              <ui-button icon class="rounded-l-none" variant="accent">
                <v-remixicon name="riArrowLeftSLine" rotate="-90" />
              </ui-button>
            </template>
            <ui-list class="space-y-1">
              <ui-list-item
                v-close-popover
                class="cursor-pointer"
                @click="openImportDialog"
              >
                {{ t('workflow.import') }}
              </ui-list-item>
              <ui-list-item
                v-close-popover
                class="cursor-pointer"
                @click="initRecordWorkflow"
              >
                {{ t('home.record.title') }}
              </ui-list-item>
            </ui-list>
          </ui-popover>
        </div>
        <ui-list class="mt-6 space-y-2">
          <ui-expand
            :model-value="true"
            append-icon
            header-class="px-4 py-2 rounded-lg hoverable w-full flex items-center"
          >
            <template #header>
              <v-remixicon name="riFlowChart" />
              <span class="ml-4 flex-1 text-left capitalize">
                {{ t('workflow.my') }}
              </span>
            </template>
            <ui-list class="mt-1 space-y-1">
              <ui-list-item
                tag="button"
                :active="state.activeTab === 'local'"
                color="bg-box-transparent font-semibold"
                class="pl-14"
                @click="updateActiveTab({ activeTab: 'local' })"
              >
                <span class="capitalize">
                  {{ t('workflow.type.local') }}
                </span>
              </ui-list-item>
            </ui-list>
          </ui-expand>
        </ui-list>
        <workflows-folder
          v-if="state.activeTab === 'local'"
          v-model="state.activeFolder"
        />
      </div>
      <div
        class="workflows-list flex-1 lg:ml-8"
        style="min-height: calc(100vh - 8rem)"
        @dblclick="clearSelectedWorkflows"
      >
        <div class="flex flex-wrap items-center">
          <div class="flex w-full items-center md:w-auto">
            <ui-input
              id="search-input"
              v-model="state.query"
              class="flex-1 md:w-auto"
              :placeholder="`${t(`common.search`)}... (${
                shortcut['action:search'].readable
              })`"
              prepend-icon="riSearch2Line"
            />
            <ui-popover>
              <template #trigger>
                <ui-button variant="accent" class="ml-4 lg:hidden">
                  <v-remixicon name="riAddLine" class="mr-2 -ml-1" />
                  <span>{{ t('common.workflow') }}</span>
                </ui-button>
              </template>
              <ui-list class="space-y-1">
                <ui-list-item
                  v-close-popover
                  class="cursor-pointer"
                  @click="addWorkflowModal.show = true"
                >
                  {{ t('workflow.new') }}
                </ui-list-item>
                <ui-list-item
                  v-close-popover
                  class="cursor-pointer"
                  @click="openImportDialog"
                >
                  {{ t('workflow.import') }}
                </ui-list-item>
                <ui-list-item
                  v-close-popover
                  class="cursor-pointer"
                  @click="initRecordWorkflow"
                >
                  {{ t('home.record.title') }}
                </ui-list-item>
              </ui-list>
            </ui-popover>
          </div>
          <div class="grow"></div>
          <div class="mt-4 flex w-full items-center md:mt-0 md:w-auto">
            <div class="workflow-sort flex flex-1 items-center">
              <ui-button
                icon
                class="rounded-r-none border-r border-gray-300 dark:border-gray-700"
                @click="
                  state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc'
                "
              >
                <v-remixicon
                  :name="state.sortOrder === 'asc' ? 'riSortAsc' : 'riSortDesc'"
                />
              </ui-button>
              <ui-select
                v-model="state.sortBy"
                :placeholder="t('sort.sortBy')"
                class="flex-1"
              >
                <option v-for="sort in sorts" :key="sort" :value="sort">
                  {{ t(`sort.${sort}`) }}
                </option>
              </ui-select>
            </div>
            <ui-select
              v-model="state.activeTab"
              class="ml-4 lg:hidden"
              :placeholder="t('common.workflow', 2)"
            >
              <option value="local">
                {{ t('workflow.type.local') }}
              </option>
            </ui-select>
          </div>
        </div>
        <ui-tab-panels v-model="state.activeTab" class="mt-6 flex-1">
          <ui-tab-panel value="local">
            <workflows-local
              v-model:per-page="state.perPage"
              :search="state.query"
              :folder-id="state.activeFolder"
              :sort="{ by: state.sortBy, order: state.sortOrder }"
            />
          </ui-tab-panel>
        </ui-tab-panels>
        <ui-card
          v-if="workflowStore.isFirstTime"
          class="first-card relative mt-8 dark:text-gray-200"
        >
          <v-remixicon
            name="riCloseLine"
            class="absolute top-4 right-4 cursor-pointer"
            @click="workflowStore.isFirstTime = false"
          />
          <p>Create your first workflow by recording your actions:</p>
          <ol class="list-inside list-decimal">
            <li>Open your browser and go to your destination URL</li>
            <li>
              Click the "Record workflow" button, and do your simple repetitive
              task
            </li>
            <li>
              Need more help? Review the workflow settings and block logs in the
              local dashboard.
            </li>
          </ol>
          <p class="mt-4">
            Recording is available locally from this dashboard.
          </p>
        </ui-card>
      </div>
    </div>
    <ui-modal v-model="addWorkflowModal.show" title="Workflow">
      <ui-input
        v-model="addWorkflowModal.name"
        :placeholder="t('common.name')"
        autofocus
        class="mb-4 w-full"
        @keyup.enter="
          addWorkflowModal.type === 'manual'
            ? addWorkflow()
            : startRecordWorkflow()
        "
      />
      <ui-textarea
        v-model="addWorkflowModal.description"
        :placeholder="t('common.description')"
        height="165px"
        class="w-full dark:text-gray-200"
        max="300"
      />
      <p class="mb-6 text-right text-gray-600 dark:text-gray-200">
        {{ addWorkflowModal.description.length }}/300
      </p>
      <div class="flex space-x-2">
        <ui-button class="w-full" @click="clearAddWorkflowModal">
          {{ t('common.cancel') }}
        </ui-button>
        <ui-button
          variant="accent"
          class="w-full"
          @click="
            addWorkflowModal.type === 'manual'
              ? addWorkflow()
              : startRecordWorkflow()
          "
        >
          {{
            addWorkflowModal.type === 'manual'
              ? t('common.add')
              : t('home.record.button')
          }}
        </ui-button>
      </div>
    </ui-modal>
    <shared-permissions-modal
      v-model="permissionState.showModal"
      :permissions="permissionState.items"
    />
  </div>
</template>
<script setup>
import SharedPermissionsModal from '@/components/newtab/shared/SharedPermissionsModal.vue';
import WorkflowsFolder from '@/components/newtab/workflows/WorkflowsFolder.vue';
import WorkflowsLocal from '@/components/newtab/workflows/WorkflowsLocal.vue';
import { useGroupTooltip } from '@/composable/groupTooltip';
import { useShortcut } from '@/composable/shortcut';
import recordWorkflow from '@/newtab/utils/startRecordWorkflow';
import { useWorkflowStore } from '@/stores/workflow';
import { getWorkflowPermissions, importWorkflow } from '@/utils/workflowData';
import { shallowReactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

useGroupTooltip();

const { t } = useI18n();
const router = useRouter();
const workflowStore = useWorkflowStore();

const sorts = ['name', 'createdAt', 'updatedAt', 'mostUsed'];
const { active: routeActive } = router.currentRoute.value.query;
const savedSorts = JSON.parse(localStorage.getItem('workflow-sorts') || '{}');

const state = shallowReactive({
  query: '',
  activeFolder: '',
  activeTab: routeActive === 'local' ? routeActive : 'local',
  perPage: savedSorts.perPage || 18,
  sortBy: savedSorts.sortBy || 'createdAt',
  sortOrder: savedSorts.sortOrder || 'desc',
});
const addWorkflowModal = shallowReactive({
  name: '',
  show: false,
  type: 'manual',
  description: '',
});
const permissionState = shallowReactive({
  items: [],
  showModal: false,
});

function clearAddWorkflowModal() {
  Object.assign(addWorkflowModal, {
    name: '',
    show: false,
    type: 'manual',
    description: '',
  });
}
function initRecordWorkflow() {
  addWorkflowModal.show = true;
  addWorkflowModal.type = 'recording';
}
function startRecordWorkflow() {
  recordWorkflow({
    name: addWorkflowModal.name,
    description: addWorkflowModal.description,
  }).then(() => {
    router.push('/recording');
  });
}
async function updateActiveTab(data = {}) {
  await router.replace({
    ...router.currentRoute.value,
    query: { active: 'local' },
  });

  Object.assign(state, { ...data, activeTab: 'local' });
}
function addWorkflow() {
  workflowStore
    .insert({
      name: addWorkflowModal.name,
      folderId: state.activeFolder,
      description: addWorkflowModal.description,
    })
    .then((workflows) => {
      const workflowId = Object.keys(workflows)[0];
      router.push(`/workflows/${workflowId}`);
    })
    .finally(clearAddWorkflowModal);
}
async function checkWorkflowPermissions(workflows) {
  let requiredPermissions = [];

  for (const workflow of workflows) {
    if (workflow.drawflow) {
      const permissions = await getWorkflowPermissions(workflow.drawflow);
      requiredPermissions.push(...permissions);
    }
  }

  requiredPermissions = Array.from(new Set(requiredPermissions));
  if (requiredPermissions.length === 0) return;

  permissionState.items = requiredPermissions;
  permissionState.showModal = true;
}
async function openImportDialog() {
  try {
    const workflows = await importWorkflow({ multiple: true });
    await checkWorkflowPermissions(Object.values(workflows));
  } catch (error) {
    console.error(error);
  }
}

const shortcut = useShortcut(['action:search', 'action:new'], ({ id }) => {
  if (id === 'action:search') {
    const searchInput = document.querySelector('#search-input input');
    searchInput?.focus();
  } else {
    addWorkflowModal.show = true;
  }
});

watch(
  () => [state.sortOrder, state.sortBy, state.perPage],
  ([sortOrder, sortBy, perPage]) => {
    localStorage.setItem(
      'workflow-sorts',
      JSON.stringify({ sortOrder, sortBy, perPage })
    );
  }
);
watch(
  () => router.currentRoute.value.query,
  (query) => {
    const newState = {};

    if (query.active && query.active !== state.activeTab) {
      newState.activeTab = 'local';
    }

    if (Object.keys(newState).length > 0) {
      Object.assign(state, newState);
    }
  },
  { immediate: true }
);
</script>
<style>
.workflow-sort select {
  @apply rounded-l-none !important;
}
.first-card {
  a {
    @apply text-blue-400 underline;
  }
}
</style>
