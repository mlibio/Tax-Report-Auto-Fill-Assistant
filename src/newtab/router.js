import { createRouter, createWebHashHistory } from 'vue-router';
import Workflows from './pages/workflows/index.vue';
import WorkflowContainer from './pages/Workflows.vue';
import WorkflowDetails from './pages/workflows/[id].vue';
import ScheduledWorkflow from './pages/ScheduledWorkflow.vue';
import Storage from './pages/Storage.vue';
import StorageTables from './pages/storage/Tables.vue';
import LogsDetails from './pages/logs/[id].vue';
import Recording from './pages/Recording.vue';
import Settings from './pages/Settings.vue';
import SettingsIndex from './pages/settings/SettingsIndex.vue';
import SettingsAbout from './pages/settings/SettingsAbout.vue';
import SettingsShortcuts from './pages/settings/SettingsShortcuts.vue';
import SettingsEditor from './pages/settings/SettingsEditor.vue';
import TaxFiling from './pages/TaxFiling.vue';

const routes = [
  {
    name: 'home',
    path: '/',
    redirect: '/workflows',
    component: Workflows,
  },
  {
    name: 'recording',
    path: '/recording',
    component: Recording,
  },
  {
    path: '/workflows',
    component: WorkflowContainer,
    children: [
      {
        path: '',
        name: 'workflows',
        component: Workflows,
      },
      {
        path: ':id',
        name: 'workflows-details',
        component: WorkflowDetails,
      },
    ],
  },
  {
    name: 'schedule',
    path: '/schedule',
    component: ScheduledWorkflow,
  },
  {
    name: 'storage',
    path: '/storage',
    component: Storage,
  },
  {
    name: 'tax-data',
    path: '/tax-data',
    component: TaxFiling,
  },
  {
    name: 'storage-tables',
    path: '/storage/tables/:id',
    component: StorageTables,
  },
  {
    name: 'logs-details',
    path: '/logs/:id?',
    component: LogsDetails,
  },
  {
    path: '/settings',
    component: Settings,
    children: [
      { path: '', component: SettingsIndex },
      { path: '/about', component: SettingsAbout },
      { path: '/editor', component: SettingsEditor },
      { path: '/shortcuts', component: SettingsShortcuts },
    ],
  },
];

export default createRouter({
  routes,
  history: createWebHashHistory(),
});
