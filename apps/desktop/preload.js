const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  print: (data) => ipcRenderer.invoke('print-labels', data),
})

// Only the production shell gets a launcher, never local configuration access.
if (window.location.origin === 'https://ivoolve-print-frontend.vercel.app') {
  contextBridge.exposeInMainWorld('ivoolvePrisma', {
    status: value => ipcRenderer.invoke('prisma:status', value),
    poll: value => ipcRenderer.invoke('prisma:poll', value),
    acknowledge: value => ipcRenderer.invoke('prisma:acknowledge', value),
    supervisedNext: value => ipcRenderer.invoke('prisma:supervised-next', value),
    supervisedExecute: value => ipcRenderer.invoke('prisma:supervised-execute', value),
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
