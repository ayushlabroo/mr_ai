const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'ayra',
  Object.freeze({
    platform: process.platform,
    gatewayStatus: () => ipcRenderer.invoke('gateway:status'),
    startDraft: (payload) => ipcRenderer.invoke('gateway:start', payload),
    getDraft: (id) => ipcRenderer.invoke('gateway:get', id),
    cancelDraft: (id) => ipcRenderer.invoke('gateway:cancel', id),
    selectWorkspace: () => ipcRenderer.invoke('workspace:select'),
    exportDocument: (document) => ipcRenderer.invoke('document:export', document),
  }),
);
