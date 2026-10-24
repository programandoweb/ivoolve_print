const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  print: (data) => ipcRenderer.invoke('print-labels', data),
})

// Only the production shell gets a launcher, never local configuration access.
if (window.location.origin === 'https://ivoolve-print-frontend.vercel.app') {
  contextBridge.exposeInMainWorld('ivoolvePrinterSettings', {
    open: () => ipcRenderer.invoke('beta-printers:open-settings'),
  })
}
