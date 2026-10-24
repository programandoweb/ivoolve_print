const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('dispatchPdf', Object.freeze({
  load: () => ipcRenderer.invoke('dispatch-pdf:load'),
  ready: result => ipcRenderer.invoke('dispatch-pdf:ready', result),
}))
