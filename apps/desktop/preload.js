const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  print: (data) => ipcRenderer.invoke('print-labels', data),
})

// Only the production shell gets a launcher, never local configuration access.
const allowedOrigin = (process.argv.find(a => a.startsWith('--ivoolve-frontend-origin=')) || '').split('=').slice(1).join('=')
  || 'https://ivoolve-print-frontend.vercel.app'
if (window.location.origin === allowedOrigin) {
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
    // Aviso inmediato de impresión pendiente (Event Hub). Devuelve la función para cancelar la suscripción.
    onWake: callback => {
      const listener = () => callback()
      ipcRenderer.on('prisma:wake', listener)
      return () => ipcRenderer.removeListener('prisma:wake', listener)
    },
  })
  contextBridge.exposeInMainWorld('ivoolveDispatchPrint', {
    run: value => ipcRenderer.invoke('dispatch-print:run', value),
  })
  contextBridge.exposeInMainWorld('ivoolvePrinterSettings', {
    open: () => ipcRenderer.invoke('beta-printers:open-settings'),
  })
  // Historial de impresiones (docs/logging/print-history.md): el usuario logueado se informa a Electron.
  contextBridge.exposeInMainWorld('ivoolvePrintHistory', {
    setActor: value => ipcRenderer.invoke('print-history:set-actor', value),
    query: value => ipcRenderer.invoke('print-history:query', value),
    info: () => ipcRenderer.invoke('print-history:info'),
    export: value => ipcRenderer.invoke('print-history:export', value),
  })
  // Diagnóstico técnico local (docs/logging). Los filtros viajan como datos: nunca rutas.
  contextBridge.exposeInMainWorld('ivoolveLogs', {
    query: value => ipcRenderer.invoke('logs:query', value),
    info: () => ipcRenderer.invoke('logs:info'),
    export: value => ipcRenderer.invoke('logs:export', value),
    report: value => ipcRenderer.invoke('logs:report', value),
  })
}
