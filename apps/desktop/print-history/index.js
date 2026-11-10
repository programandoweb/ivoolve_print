'use strict'
// Integración del historial de impresiones con Electron (main).
// - trace(): registra QUIÉN mandó a imprimir y QUÉ, y el estado final; devuelve el resultado
//   tal cual (no altera ni retrasa la impresión; un fallo de registro se absorbe).
// - El actor lo informa la interfaz (usuario logueado) por IPC; el pedidor del trabajo, si
//   Laravel lo informa, tiene prioridad. Es una atribución de la estación, no una prueba
//   criptográfica de identidad.
const fs = require('node:fs')
const { resolveHistoryRoot, createRecorder, queryPrints, serialize, infoPrints, LIMITS } = require('../../shared/print-history')

function create({ app, ipcMain, dialog, BrowserWindow, runtimeConfig, processRef = process, env = process.env, now }) {
  const root = resolveHistoryRoot({ userDataDir: app.getPath('userData'), env })
  const recorder = createRecorder({ root, env, now })
  const shells = new WeakSet()
  const actors = new WeakMap() // webContents → { id, name, role }
  let lastActor = null // última sesión informada (para llamadas sin ventana conocida)

  processRef.on('exit', () => recorder.flushSync())
  app.on('quit', () => recorder.flushSync())

  function actorOf(event) {
    return actors.get(event?.sender) || lastActor || null
  }

  function authorize(event) {
    let origin
    try { origin = new URL(event.senderFrame.url).origin } catch { /* sin origen */ }
    if (!shells.has(event.sender) || event.senderFrame !== event.sender.mainFrame || origin !== runtimeConfig.frontendOrigin) throw Error('Origen no autorizado para el historial de impresión')
  }

  /**
   * @param {{kind:'labels'|'letterhead', origin:string, event:any, payload:any, context?:object, correlationId?:string}} d
   * @param {() => Promise<any>} run ejecuta la impresión real
   */
  async function trace(d, run) {
    let attempt = null
    try {
      const requester = d.context?.jobMeta?.requested_by
      const actor = requester && typeof requester === 'object' && (requester.id || requester.name)
        ? { value: requester, source: 'job_requester' }
        : { value: actorOf(d.event), source: 'logged_in_user' }
      attempt = recorder.begin({ kind: d.kind, origin: d.origin, actor, payload: d.payload, context: d.context, correlationId: d.correlationId })
    } catch { /* el historial nunca rompe la impresión */ }
    try {
      const result = await run()
      attempt?.finish(result)
      return result
    } catch (error) {
      attempt?.fail(error)
      throw error
    }
  }

  ipcMain.handle('print-history:set-actor', (event, value) => {
    authorize(event)
    if (value === null || value === undefined) { actors.delete(event.sender); lastActor = null; return { ok: true } }
    const id = value.id !== undefined && value.id !== null ? String(value.id).slice(0, 40) : ''
    const name = typeof value.name === 'string' ? value.name.slice(0, 80) : ''
    if (!id && !name) return { ok: false }
    const actor = { id, name, role: typeof value.role === 'string' ? value.role.slice(0, 60) : '' }
    actors.set(event.sender, actor); lastActor = actor
    return { ok: true }
  })
  const failRead = () => ({ ok: false, error: 'No fue posible leer el historial de impresión.' })
  ipcMain.handle('print-history:query', async (event, value) => {
    authorize(event)
    try { return { ok: true, ...(await queryPrints(root, value)) } } catch { return failRead() }
  })
  ipcMain.handle('print-history:info', async event => {
    authorize(event)
    try { return { ok: true, ...(await infoPrints(root)), retentionDays: recorder.config.retentionDays, ...recorder.stats() } } catch { return failRead() }
  })
  ipcMain.handle('print-history:export', async (event, value) => {
    authorize(event)
    const format = value?.format === 'csv' ? 'csv' : 'jsonl'
    try {
      const { items } = await queryPrints(root, value?.query, { exporting: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
        title: 'Exportar historial de impresión', defaultPath: `historial-impresion-${stamp}.${format}`,
        filters: [{ name: format === 'csv' ? 'CSV' : 'JSON Lines', extensions: [format] }],
      })
      if (canceled || !filePath) return { ok: true, cancelled: true }
      await fs.promises.writeFile(filePath, serialize(items, format), 'utf8')
      return { ok: true, count: items.length, truncated: items.length >= LIMITS.maxExport }
    } catch { return failRead() }
  })

  return {
    trace, recorder, root,
    attachShell: win => { shells.add(win.webContents); win.webContents.once('destroyed', () => actors.delete(win.webContents)) },
    setStationId: id => recorder.setStationId(id),
  }
}

module.exports = { create }
