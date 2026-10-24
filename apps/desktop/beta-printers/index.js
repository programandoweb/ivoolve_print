const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')
const { Store, resolve, validIdentity, text } = require('./core')
const { inventory } = require('./inventory')
const same = (a, b) => ['name', 'driver', 'port', 'pnp', 'serial'].every(k => a[k] === b[k])
const escape = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function register({ app, BrowserWindow, Menu, ipcMain, dialog }) {
  const url = pathToFileURL(path.join(__dirname, 'index.html')).href
  const store = new Store(app.getPath('userData'))
  let window = null; let busy = false
  const status = () => ({ ...store.read(), diagnostic: store.diagnostic })
  const handlers = {
    getStatus: () => status(),
    setEnabled(value) {
      if (typeof value !== 'boolean') throw Error('Activación inválida')
      return store.write({ ...store.read(), enabled: value })
    },
    async refresh() { return inventory(window.webContents) },
    saveProfile(value) {
      if (!value || !text(value.id, 64) || !text(value.label, 80) || !value.label.trim() || !(value.identity === null || validIdentity(value.identity))) throw Error('Perfil inválido')
      const state = store.read()
      const id = value.id || randomUUID()
      if (state.profiles.some(p => p.id !== id && p.label.toLocaleLowerCase() === value.label.trim().toLocaleLowerCase())) throw Error('El nombre del perfil ya existe')
      const profile = { id, label: value.label.trim(), identity: value.identity }
      return store.write({ ...state, profiles: [...state.profiles.filter(p => p.id !== id), profile] })
    },
    removeProfile(id) {
      if (!text(id, 64) || !store.read().profiles.some(p => p.id === id)) throw Error('Perfil desconocido')
      return store.write({ ...store.read(), profiles: store.read().profiles.filter(p => p.id !== id) })
    },
    async testPrint(value) {
      if (!value || value.confirmed !== true || !validIdentity(value.identity) || busy) throw Error('Prueba inválida o en curso')
      busy = true
      let printWindow
      try {
        const selected = value.identity
        const check = async () => {
          const { printers } = await inventory(window.webContents)
          const match = resolve(selected, printers)
          if (!store.read().enabled || !['verified', 'probable'].includes(match.state) || !printers.some(p => same(p.identity, selected))) throw Error('Destino ambiguo o inventario modificado. Verifique en Windows y vuelva a vincular.')
        }
        await check()
        const choice = await dialog.showMessageBox(window, { type: 'question', buttons: ['Cancelar', 'Confirmar prueba'], defaultId: 0, cancelId: 0,
          message: 'Enviar una sola página de identificación', detail: `Cola: ${selected.name}\nDriver: ${selected.driver || 'Desconocido'}\nPuerto: ${selected.port || 'Desconocido'}\nEn el diálogo Windows confirme esta misma cola. No cambie el destino.` })
        if (choice.response !== 1) return { cancelled: true }
        await check()
        printWindow = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<!doctype html><meta charset="utf-8"><style>@page{margin:3mm}body{font:12px sans-serif}h1{font-size:16px}</style><h1>Identificación BETA</h1><p>' + escape(selected.name) + '</p><p>' + escape(selected.port || 'Puerto desconocido') + '</p>')}`)
        return await new Promise(resolveResult => printWindow.webContents.print({ silent: false, deviceName: selected.name, copies: 1, pageRanges: [{ from: 0, to: 0 }], printBackground: true }, success => resolveResult({ success })))
      } finally { if (printWindow && !printWindow.isDestroyed()) printWindow.close(); busy = false }
    },
  }
  for (const [method, handler] of Object.entries(handlers)) {
    ipcMain.handle(`beta-printers:${method}`, async (event, value) => {
      // Require the exact local document AND the owning top-level frame/webContents.
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== url) throw Error('Origen no autorizado')
      try {
        if (!['getStatus', 'setEnabled'].includes(method) && !store.read().enabled) throw Error('BETA desactivada')
        return { ok: true, data: await handler(value) }
      } catch { return { ok: false, error: 'Operación rechazada. Revise los datos, habilitación BETA, permisos y coincidencia del dispositivo; si es ambiguo, verifique manualmente en Windows.' } }
    })
  }
  function open() {
    if (window && !window.isDestroyed()) return window.focus()
    window = new BrowserWindow({ width: 1100, height: 800, title: 'Impresoras BETA', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    window.webContents.on('will-attach-webview', event => event.preventDefault())
    window.on('closed', () => { window = null })
    window.loadFile(path.join(__dirname, 'index.html'))
  }
  return function attach(shell) {
    shell.setMenu(Menu.buildFromTemplate([{ label: '⚙ Impresoras BETA', submenu: [{ label: 'Configurar perfiles locales…', click: open }] }]))
    shell.setMenuBarVisibility(true)
  }
}
module.exports = { register }
