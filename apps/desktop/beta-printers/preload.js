const { contextBridge, ipcRenderer } = require('electron')
const invoke = (method, value) => ipcRenderer.invoke(`beta-printers:${method}`, value)
contextBridge.exposeInMainWorld('betaPrinters', Object.freeze({
  getStatus: () => invoke('getStatus'), setEnabled: value => invoke('setEnabled', value),
  setSilentSettings: value => invoke('setSilentSettings', value),
  refresh: () => invoke('refresh'), saveProfile: value => invoke('saveProfile', value),
  removeProfile: id => invoke('removeProfile', id), testPrint: value => invoke('testPrint', value),
}))
