const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  print: (data) => ipcRenderer.invoke('print-labels', data),
})