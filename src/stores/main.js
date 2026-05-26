import { defineStore } from 'pinia';
import defu from 'defu';
import browser from 'webextension-polyfill';
import deepmerge from 'lodash.merge';

export const useStore = defineStore('main', {
  storageMap: {
    tabs: 'tabs',
    settings: 'settings',
  },
  state: () => ({
    tabs: [],
    copiedEls: {
      edges: [],
      nodes: [],
    },
    settings: {
      locale: 'zh',
      deleteLogAfter: 30,
      logsLimit: 1000,
      editor: {
        minZoom: 0.3,
        maxZoom: 1.3,
        arrow: true,
        snapToGrid: false,
        lineType: 'default',
        saveWhenExecute: false,
        snapGrid: { 0: 15, 1: 15 },
      },
    },
    integrations: {
      googleDrive: false,
    },
    integrationsRetrieved: {
      googleDrive: false,
    },
    retrieved: true,
    connectedSheets: [],
    connectedSheetsRetrieved: false,
  }),
  actions: {
    loadSettings() {
      return browser.storage.local.get('settings').then(({ settings }) => {
        this.settings = defu(settings || {}, this.settings);
        this.settings.locale = 'zh';
        this.retrieved = true;
      });
    },
    async updateSettings(settings = {}) {
      this.settings = deepmerge(this.settings, settings);
      await this.saveToStorage('settings');
    },
    async checkGDriveIntegration() {
      this.integrations.googleDrive = false;
      this.integrationsRetrieved.googleDrive = true;
    },
    async getConnectedSheets() {
      this.connectedSheets = [];
      this.connectedSheetsRetrieved = true;
      this.integrations.googleDrive = false;
    },
  },
});
