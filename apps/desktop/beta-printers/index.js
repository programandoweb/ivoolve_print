const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')
const { Store, resolve, validIdentity, text } = require('./core')
const { inventory } = require('./inventory')
const { defaults: defaultPaper, validPaper, paperOptions, paperCss, calibrationHtml } = require('./paper')
const { silentOptions, printProfile, sameIdentity } = require('./silent')
const same = (a, b) => ['name', 'driver', 'port', 'pnp', 'serial'].every(k => a[k] === b[k])
const escape = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function register({ app, BrowserWindow, Menu, ipcMain, dialog }) {
  const url = pathToFileURL(path.join(__dirname, 'index.html')).href
  const store = new Store(app.getPath('userData'))
  const authorizedShells = new WeakSet()
  let window = null; let busy = false
  const status = () => ({ ...store.read(), diagnostic: store.diagnostic })
  const handlers = {
    getStatus: () => status(),
    setEnabled(value) {
      if (typeof value !== 'boolean') throw Error('Activación inválida')
      const state = store.read()
      return store.write({ ...state, enabled: value, profiles: value ? state.profiles : state.profiles.map(p => ({ ...p, silentEnabled: false, silentQueueConfirmation: null })) })
    },
    async setProfileSettings(value) {
      if (!value || typeof value.enabled !== 'boolean' || typeof value.silentEnabled !== 'boolean' || !text(value.id, 64)) throw Error('Ajuste inválido')
      const state = store.read()
      const profile = state.profiles.find(p => p.id === value.id)
      if (!profile) throw Error('Perfil desconocido')
      const target = { ...profile, enabled: value.enabled, silentEnabled: value.enabled && value.silentEnabled, silentQueueConfirmation: null }
      const next = { ...state, profiles: state.profiles.map(p => p.id === target.id ? target : p) }
      if (target.silentEnabled) {
        const result = await inventory(window.webContents)
        try { silentOptions(next, result.printers, target.id) } catch (error) {
          if (error.code !== 'QUEUE_CONFIRMATION_REQUIRED') throw error
          const selected = target.identity
          const choice = await dialog.showMessageBox(window, {
            type: 'warning', buttons: ['Cancelar', 'Confirmar esta cola'], defaultId: 0, cancelId: 0,
            message: 'Hay impresoras del mismo modelo. Confirme la cola Windows.',
            detail: `Perfil: ${profile.label}\nCola: ${selected.name}\nDriver: ${selected.driver}\nPuerto: ${selected.port}\n\nEsta confirmación identifica la cola, no un equipo físico por serial. Verifique en Windows que esa cola imprime en el equipo deseado. Si intercambia equipos o cables sin cambios visibles para Windows, deberá verificarlo de nuevo. ¿Autoriza los envíos sin diálogo a esta cola?`,
          })
          if (store.read() !== state) throw Error('Configuración modificada; vuelva a intentarlo')
          if (choice.response !== 1) return state
          target.silentQueueConfirmation = { ...selected }
          const current = await inventory(window.webContents)
          silentOptions(next, current.printers, target.id)
        }
        if (store.read() !== state) throw Error('Configuración modificada; vuelva a intentarlo')
      }
      return store.write(next)
    },
    setLabelsProfile(id) {
      if (!text(id, 64)) throw Error('Perfil inválido')
      const state = store.read()
      const profile = state.profiles.find(p => p.id === id)
      if (!profile?.enabled) throw Error('Perfil desactivado o desconocido')
      return store.write({ ...state, labelsProfileId: id })
    },
    async refresh() { return inventory(window.webContents) },
    saveProfile(value) {
      if (!value || !text(value.id, 64) || !text(value.label, 80) || !value.label.trim() || !(value.identity === null || validIdentity(value.identity))) throw Error('Perfil inválido')
      const state = store.read()
      const id = value.id || randomUUID()
      if (state.profiles.some(p => p.id !== id && p.label.toLocaleLowerCase() === value.label.trim().toLocaleLowerCase())) throw Error('El nombre del perfil ya existe')
      const previous = state.profiles.find(p => p.id === id)
      const unchanged = previous && ((previous.identity === null && value.identity === null) || sameIdentity(previous.identity, value.identity))
      const profile = { paper: previous?.paper ?? defaultPaper(), id, label: value.label.trim(), identity: value.identity, enabled: previous?.enabled ?? true, silentEnabled: unchanged ? previous.silentEnabled : false, silentQueueConfirmation: unchanged ? previous.silentQueueConfirmation : null }
      return store.write({ ...state, profiles: [...state.profiles.filter(p => p.id !== id), profile] })
    },
    savePaper(value) {
      if (!value || !text(value.id, 64) || !validPaper(value.paper)) throw Error('Papel: medidas o márgenes inválidos.')
      const state = store.read()
      if (!state.profiles.some(p => p.id === value.id)) throw Error('Perfil desconocido')
      return store.write({ ...state, profiles: state.profiles.map(p => p.id === value.id ? { ...p, paper: { ...value.paper } } : p) })
    },
    async calibrateProfile(value) {
      if (!value || !text(value.id, 64) || value.confirmed !== true || busy) throw Error('Prueba inválida o en curso')
      busy = true
      let printWindow
      try {
        const state = store.read()
        const profile = printProfile(state, value.id)
        if (!profile?.identity) throw Error('Papel: vincule una impresora antes de calibrar.')
        const validate = async () => {
          if (store.read() !== state) throw Error('Configuración modificada; vuelva a intentarlo')
          const result = await inventory(window.webContents)
          const checkState = { ...state, profiles: state.profiles.map(p => p.id === profile.id ? { ...p, silentEnabled: true } : p) }
          const target = silentOptions(checkState, result.printers, profile.id)
          if (store.read() !== state) throw Error('Configuración modificada; vuelva a intentarlo')
          return target.deviceName
        }
        const deviceName = await validate()
        const paper = profile.paper ?? defaultPaper()
        const choice = await dialog.showMessageBox(window, { type: 'question', buttons: ['Cancelar', 'Imprimir calibración'], defaultId: 0, cancelId: 0,
          message: 'Imprimir una página de calibración', detail: `Perfil: ${profile.label}\nCola: ${deviceName}\nPapel: ${paper.source === 'driver' ? 'Configuración de Windows' : paper.widthMm + ' × ' + paper.heightMm + ' mm'}\nSe abrirá el diálogo Windows. Confirme esta misma cola y una copia.` })
        if (choice.response !== 1) return { cancelled: true }
        await validate()
        printWindow = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(calibrationHtml(paper, profile.label))}`)
        return await new Promise(resolveResult => printWindow.webContents.print({ ...paperOptions(paper, true), silent: false, deviceName, copies: 1, pageRanges: [{ from: 0, to: 0 }], printBackground: true }, success => resolveResult({ success })))
      } finally { if (printWindow && !printWindow.isDestroyed()) printWindow.close(); busy = false }
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
      } catch (error) { return { ok: false, error: ((method === 'setProfileSettings' && error.message.startsWith('Impresión sin diálogo')) || (['savePaper', 'calibrateProfile'].includes(method) && error.message.startsWith('Papel:'))) ? error.message : 'Operación rechazada. Revise los datos, habilitación BETA, permisos y coincidencia del dispositivo; si es ambiguo, verifique manualmente en Windows.' } }
    })
  }
  // The remote shell can only open our local window. Configuration IPC remains local.
  ipcMain.handle('beta-printers:open-settings', (event) => {
    let allowedOrigin = false
    try { allowedOrigin = new URL(event.senderFrame.url).origin === 'https://ivoolve-print-frontend.vercel.app' } catch {}
    if (!authorizedShells.has(event.sender) || event.senderFrame !== event.sender.mainFrame || !allowedOrigin) throw Error('Origen no autorizado')
    open()
    return { ok: true }
  })
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
  function attach(shell) {
    if (shell.webContents) authorizedShells.add(shell.webContents)
    shell.setMenu(Menu.buildFromTemplate([{ label: '⚙ Impresoras BETA', submenu: [{ label: 'Configurar perfiles locales…', click: open }] }]))
    shell.setMenuBarVisibility(true)
  }
  attach.getPrintPlan = async (event) => {
    const state = store.read()
    const profile = printProfile(state)
    if (!profile) return { options: {}, css: '' }
    const paper = profile.paper ?? defaultPaper()
    const css = paperCss(paper)
    const options = paperOptions(paper, profile.silentEnabled)
    if (!profile.silentEnabled && paper.source === 'driver' && !css) return { options, css }
    let allowedOrigin = false
    try { allowedOrigin = new URL(event.senderFrame.url).origin === 'https://ivoolve-print-frontend.vercel.app' } catch {}
    if (!authorizedShells.has(event.sender) || event.senderFrame !== event.sender.mainFrame || !allowedOrigin) throw Error('Origen no autorizado para impresión configurada')
    if (!profile.silentEnabled) return { options, css }
    const result = await inventory(event.sender)
    if (store.read() !== state) throw Error('Configuración modificada durante la impresión. Vuelva a enviar el trabajo.')
    return { options: { ...silentOptions(state, result.printers), ...options }, css }
  }
  attach.getPrintOptions = async event => (await attach.getPrintPlan(event)).options
  return attach
}
module.exports = { register }
