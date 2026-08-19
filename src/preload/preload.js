'use strict';
/** Renderer bridge. Minimal, typed-by-convention API at window.dshDesktop. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dshDesktop', {
  onStatus: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('dsh:status', listener);
    return () => ipcRenderer.removeListener('dsh:status', listener);
  },
  onServerState: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('dsh:server-state', listener);
    return () => ipcRenderer.removeListener('dsh:server-state', listener);
  },
  onLog: (cb) => {
    const listener = (_e, line) => cb(line);
    ipcRenderer.on('dsh:log', listener);
    return () => ipcRenderer.removeListener('dsh:log', listener);
  },
  onOpLog: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('dsh:op-log', listener);
    return () => ipcRenderer.removeListener('dsh:op-log', listener);
  },
  getStatus: () => ipcRenderer.invoke('status:get'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  listDistros: () => ipcRenderer.invoke('distros:list'),
  runBootstrap: () => ipcRenderer.invoke('bootstrap:run'),
  restartServer: () => ipcRenderer.invoke('server:restart'),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  runPlugin: (argsLine) => ipcRenderer.invoke('plugin:run', argsLine),
  runDsh: (argsLine) => ipcRenderer.invoke('dsh:run', argsLine),
  readConfig: (kind) => ipcRenderer.invoke('config:read', kind),
  writeConfig: (kind, content) => ipcRenderer.invoke('config:write', kind, content),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  openShell: () => ipcRenderer.invoke('shell:open'),
  openExplorer: (target) => ipcRenderer.invoke('explorer:open', target),
  openBrowser: (url) => ipcRenderer.invoke('browser:open', url),
  appInfo: () => ipcRenderer.invoke('app:info'),
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  showMainWindow: () => ipcRenderer.invoke('window:show-main')
});
