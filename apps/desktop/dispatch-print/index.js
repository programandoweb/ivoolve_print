const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { client, today, validateInput } = require('./service')
const SCHEME = 'ivoolve-dispatch'
const DOCUMENT = `${SCHEME}://print/pdf-print.html`
function registerScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}
function assetPath(url, packageRoot) {
  const parsed = new URL(url)
  if (parsed.protocol !== `${SCHEME}:` || parsed.hostname !== 'print' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return null
  const local = { '/pdf-print.html': ['pdf-print.html', 'text/html'], '/pdf-print.mjs': ['pdf-print.mjs', 'text/javascript'], '/pdf-print.css': ['pdf-print.css', 'text/css'] }
  if (local[parsed.pathname]) return { path: path.join(__dirname, local[parsed.pathname][0]), type: local[parsed.pathname][1] }
  if (['/pdf.mjs', '/pdf.worker.mjs'].includes(parsed.pathname)) return { path: path.join(packageRoot, 'legacy', 'build', parsed.pathname.slice(1)), type: 'text/javascript' }
  const match = /^\/(standard_fonts|cmaps|wasm)\/([A-Za-z0-9_-]+\.(?:pfb|ttf|bcmap|wasm))$/.exec(parsed.pathname)
  if (match) return { path: path.join(packageRoot, match[1], match[2]), type: match[1] === 'wasm' ? 'application/wasm' : 'application/octet-stream' }
  return null
}
function register({ BrowserWindow, ipcMain, protocol, net, profiles, fetchImpl = fetch, now = () => new Date() }) {
  const shells = new WeakSet(); const jobs = new Map(); const pending = new WeakSet()
  const service = client(fetchImpl)
  const packageRoot = path.dirname(require.resolve('pdfjs-dist/package.json'))
  protocol.handle(SCHEME, async request => {
    const asset = assetPath(request.url, packageRoot)
    if (request.method !== 'GET' || !asset) return new Response('Not found', { status: 404 })
    const response = await net.fetch(pathToFileURL(asset.path).href)
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': asset.type } })
  })
  function authorize(event) {
    let origin
    try { origin = new URL(event.senderFrame.url).origin } catch {}
    if (!shells.has(event.sender) || event.senderFrame !== event.sender.mainFrame || origin !== 'https://ivoolve-print-frontend.vercel.app') throw Error('Origen no autorizado')
  }
  function localJob(event) {
    const job = jobs.get(event.sender)
    if (!job || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== DOCUMENT) throw Error('Origen PDF no autorizado')
    return job
  }
  ipcMain.handle('dispatch-pdf:load', event => {
    const job = localJob(event)
    if (job.loaded) throw Error('Documento ya entregado')
    job.loaded = true
    return { bytes: new Uint8Array(job.bytes), paper: job.paper }
  })
  ipcMain.handle('dispatch-pdf:ready', (event, result) => {
    const job = localJob(event)
    if (!result || result.ok !== true || !Number.isInteger(result.pages) || result.pages < 1 || result.pages > 20 || typeof result.scaled !== 'boolean') job.reject(Error('No fue posible preparar el PDF original para imprimir.'))
    else job.resolve({ pages: result.pages, scaled: result.scaled })
    return true
  })
  const run = async (event, value, context = {}) => {
    const printPlan = context.prismaSupervised === true
      ? () => profiles.getPrismaPrintPlan(event, 'letterhead')
      : () => profiles.getPrintPlan(event, 'letterhead')
    authorize(event)
    if (pending.has(event.sender)) return { ok: false, error: 'Ya hay un membrete en proceso. Espera a que finalice.' }
    pending.add(event.sender)
    let printWindow; let timeout
    try {
      validateInput(value)
      const date = today(now())
      // Check the configured profile before authenticated lookups; never borrow the labels profile.
      await printPlan()
      const matches = await service.search(value, date)
      if (today(now()) !== date) throw Error('Cambió el día de despacho. Vuelve a buscar.')
      if (!matches.length) throw Error(`No se encontró el despacho ${value.number} de hoy (${date}).`)
      if (value.dispatchId === undefined && matches.length > 1) return { ok: true, status: 'choose', date, candidates: matches.map(({ reference, ...candidate }) => candidate) }
      const selected = value.dispatchId === undefined ? matches[0] : matches.find(p => p.id === value.dispatchId)
      if (!selected) throw Error('El despacho elegido no coincide con la búsqueda de hoy.')
      const pdf = await service.download(selected, value, date)
      const plan = await profiles.getPrintPlan(event, 'letterhead')
      if (today(now()) !== date) throw Error('Cambió el día de despacho. Vuelve a buscar.')
      printWindow = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'pdf-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
      printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      printWindow.webContents.on('will-navigate', e => e.preventDefault())
      printWindow.webContents.on('will-attach-webview', e => e.preventDefault())
      let job
      const ready = new Promise((resolve, reject) => { job = { bytes: pdf, paper: plan.paper, loaded: false, resolve, reject }; timeout = setTimeout(() => reject(Error('Se agotó el tiempo de preparación del PDF. No se imprimió.')), 45000) })
      jobs.set(printWindow.webContents, job)
      // Attach error handling before navigation can trigger the renderer's ready signal.
      const preparation = Promise.all([printWindow.loadURL(DOCUMENT), ready])
      const [, rendering] = await preparation
      clearTimeout(timeout)
      const current = await profiles.getPrintPlan(event, 'letterhead')
      if (JSON.stringify(current) !== JSON.stringify(plan)) throw Error('Cambió la configuración de Membretes. Vuelve a enviar el trabajo.')
      if (today(now()) !== date) throw Error('Cambió el día de despacho. Vuelve a buscar.')
      const { margins, ...options } = plan.options
      const result = await new Promise(resolve => printWindow.webContents.print({ ...options, silent: false, margins: { marginType: 'none' }, printBackground: true, copies: 1, scaleFactor: 100 }, success => resolve(success)))
      if (!result) return { ok: false, error: 'La impresión fue cancelada o falló. No se reintentó el envío.' }
      return { ok: true, status: 'printed', date, number: selected.number, pages: rendering.pages, scaled: rendering.scaled, message: `Despacho ${selected.number} enviado a impresión.${rendering.scaled ? ' El PDF se ajustó proporcionalmente al papel del perfil.' : ''}` }
    } catch (error) {
      // Only application-authored messages escape this boundary; never expose URLs, headers or file paths.
      const message = typeof error?.message === 'string' ? error.message : ''
      const safe = /^(Escribe|Inicia sesión|Sesión|No |El |La |Cambió|Cambi[oó]|Fecha|Referencia|Selección|Habilita|Perfil|Impresión|Se agotó)/.test(message) && !/https?:|[A-Za-z]:\\|\/workspace|\/node_modules/.test(message)
      return { ok: false, error: safe ? message.slice(0, 300) : 'No fue posible imprimir el membrete. Revisa la sesión y el perfil Membretes.' }
    } finally {
      clearTimeout(timeout)
      if (printWindow) { jobs.delete(printWindow.webContents); if (!printWindow.isDestroyed()) printWindow.close() }
      pending.delete(event.sender)
    }
  }
  ipcMain.handle('dispatch-print:run', run)
  const attach = shell => shells.add(shell.webContents)
  attach.run = run
  return attach
}
module.exports = { registerScheme, register, assetPath }
