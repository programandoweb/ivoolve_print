const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  print: (data) => ipcRenderer.invoke('print-labels', data),
})

// Only the production shell gets a launcher, never local configuration access.
if (window.location.origin === 'https://ivoolve-print-frontend.vercel.app') {
  contextBridge.exposeInMainWorld('ivoolvePrisma', {
    interpret: value => ipcRenderer.invoke('prisma:interpret', value),
    execute: value => ipcRenderer.invoke('prisma:execute', value),
    choose: value => ipcRenderer.invoke('prisma:choose', value),
    cancel: () => ipcRenderer.invoke('prisma:cancel'),
  })
  contextBridge.exposeInMainWorld('ivoolveDispatchPrint', {
    run: value => ipcRenderer.invoke('dispatch-print:run', value),
  })
  contextBridge.exposeInMainWorld('ivoolvePrinterSettings', {
    open: () => ipcRenderer.invoke('beta-printers:open-settings'),
  })
}
