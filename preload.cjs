const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopUpdater', {
  install: () => ipcRenderer.invoke('install-update'),
  onStatus: (callback) => ipcRenderer.on('update-status', (_event, status) => callback(status))
});