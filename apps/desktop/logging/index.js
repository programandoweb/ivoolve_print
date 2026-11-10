'use strict'
// Integración del logging técnico con Electron (proceso main).
// - Escribe JSONL en <userData>/logs/electron y lee también <userData>/logs/api para la UI.
// - Registra, no decide: ningún flujo de impresión depende de este módulo y todo fallo de
//   registro se absorbe. NO es auditoría de impresiones ni confirma salida física.
const { randomUUID } = require('node:crypto')
const { AsyncLocalStorage } = require('node:async_hooks')
const fs = require('node:fs')
const { createLogger, resolveRoot, queryLogs, serialize, infoLogs, LIMITS } = require('../../shared/logging')

// Canales que ya devuelven { ok:false } en vez de lanzar: se observa su resultado.
const PRINT_CHANNELS = Object.freeze({ 'print-labels': 'labels', 'dispatch-print:run': 'letterhead' })
const CONFIG_CHANNELS = new Set(['setEnabled', 'setProfileSettings', 'setPrismaEnabled', 'setLabelsProfile', 'setLetterheadProfile', 'saveProfile', 'savePaper', 'removeProfile', 'calibrateProfile'].map(m => `beta-printers:${m}`))
const ORIGIN_ERROR = /^Origen\b.*no autorizado/i

const noopLog = Object.freeze({
  log() {}, debug() {}, info() {}, warn() {}, error() {}, withJob: (_m, fn) => fn(), pollOk() {}, pollFail() {}, backendOk() {}, backendFailure() {},
  withCorrelation: (_id, fn) => fn(),
})

function safeOrigin(url) { try { return new URL(url).origin } catch { return undefined } }

function create({ app, ipcMain, dialog, BrowserWindow, runtimeConfig, processRef = process, env = process.env }) {
  const root = resolveRoot({ userDataDir: app.getPath('userData'), env })
  const logger = createLogger({ root, component: 'electron', processName: 'main', env })
  const shells = new WeakSet()
  const reportWindow = { start: Date.now(), count: 0 }
  let firstWindow = true
  let polling = false
  // Historial de impresiones (módulo aparte): se enlaza al arrancar con setPrintTrace().
  let printTrace = null
  // Metadatos del trabajo supervisado (id, origen, pedidor) por canal lateral: no se añaden a los argumentos de impresión.
  const jobStore = new AsyncLocalStorage()
  const traced = (descriptor, run) => {
    if (!printTrace) return run()
    const jobMeta = descriptor.context?.jobMeta || jobStore.getStore()
    return printTrace({ ...descriptor, context: { ...(descriptor.context || {}), ...(jobMeta ? { jobMeta } : {}) }, correlationId: logger.currentCorrelation() }, run)
  }

  // ---- arranque, configuración y ciclo de vida -------------------------------------------
  logger.info('app.started', 'ivoolve_print (Electron) iniciado', {
    metadata: {
      version: app.getVersion(), electron: processRef.versions.electron, chrome: processRef.versions.chrome, node: processRef.versions.node,
      pid: processRef.pid, platform: processRef.platform, packaged: app.isPackaged,
    },
  })
  logger.info('config.loaded', 'Configuración operativa resuelta', {
    metadata: {
      frontend_origin: runtimeConfig.frontendOrigin, backends: Object.keys(runtimeConfig.BACKENDS || {}), socket_backends: Object.keys(runtimeConfig.SOCKETS || {}),
      dev_frontend_override: env.IVOOLVE_PRINT_DEV === '1', log_level: logger.config.level, log_retention_days: logger.config.retentionDays,
    },
  })

  // 'uncaughtExceptionMonitor' observa sin alterar el comportamiento por defecto de Electron/Node.
  processRef.on('uncaughtExceptionMonitor', (error, origin) => {
    logger.fatal(origin === 'unhandledRejection' ? 'error.unhandled_rejection' : 'error.uncaught_exception', 'Excepción no controlada en el proceso principal', { error, dedupe: true })
    logger.flushSync()
  })
  // Con un listener Node deja de imprimir el aviso por defecto: se replica en consola.
  processRef.on('unhandledRejection', reason => {
    logger.error('error.unhandled_rejection', 'Promesa rechazada sin manejar', { error: reason, dedupe: true })
    console.error('Unhandled Rejection:', reason)
  })
  processRef.on('exit', () => logger.flushSync())

  app.on('before-quit', () => logger.info('app.stopping', 'Electron inició el cierre'))
  app.on('quit', (_event, code) => { logger.info('app.stopped', 'Cierre limpio de Electron', { metadata: { exit_code: code } }); logger.flushSync() })
  app.on('render-process-gone', (_event, _contents, details) => logger.error('window.render_process_gone', 'El proceso de renderizado terminó inesperadamente', { metadata: { reason: details?.reason, exit_code: details?.exitCode } }))
  app.on('child-process-gone', (_event, details) => logger.error('child_process.gone', 'Un proceso hijo de Electron terminó inesperadamente', { metadata: { type: details?.type, reason: details?.reason, exit_code: details?.exitCode, name: details?.name } }))
  app.on('web-contents-created', (_event, contents) => {
    contents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3) return // -3 = navegación abortada, no es un fallo
      logger.error('window.load_failed', 'La ventana no pudo cargar la página', { metadata: { error_code: code, description, origin: safeOrigin(url) } })
    })
    contents.on('unresponsive', () => logger.error('window.unresponsive', 'La ventana dejó de responder'))
    contents.on('responsive', () => logger.info('window.responsive', 'La ventana volvió a responder'))
  })
  app.on('browser-window-created', (_event, win) => {
    const primary = firstWindow; firstWindow = false
    logger.log(primary ? 'info' : 'debug', 'window.created', primary ? 'Ventana principal creada' : 'Ventana auxiliar creada (impresión)', { metadata: { primary } })
    win.on('closed', () => logger.log(primary ? 'info' : 'debug', 'window.closed', primary ? 'Ventana principal cerrada' : 'Ventana auxiliar cerrada', { metadata: { primary } }))
  })

  // ---- impresión (solo diagnóstico técnico) ------------------------------------------------
  function logPrint(kind, result, context = {}, durationMs) {
    try {
      const base = { duration_ms: durationMs, metadata: { kind, supervised: context.prismaSupervised === true, silent_confirmed: context.prismaConfirmed === true, status: result?.status, pages: result?.pages, scaled: result?.scaled } }
      if (result?.ok === true && result.status === 'choose') {
        logger.info('print.letterhead_ambiguous', 'Varios despachos candidatos; no se envió nada a imprimir', base)
      } else if (result?.ok === true) {
        // webContents.print() devolvió success: el diálogo/cola de Windows aceptó el trabajo.
        logger.info(`print.${kind}_submitted`, 'La llamada de impresión terminó sin error técnico. No confirma salida física del papel.', base)
      } else {
        const reason = String(result?.message || result?.error || 'sin detalle')
        logger.log(/cancel/i.test(reason) ? 'warn' : 'error', `print.${kind}_failed`, `La impresión no se completó: ${reason}`, base)
      }
    } catch { /* el registro nunca afecta a la impresión */ }
  }

  function instrumentPrint(kind, fn) {
    return (event, payload, context = {}) => logger.withCorrelation(null, async () => {
      const started = Date.now()
      try {
        const origin = context?.prismaSupervised === true ? 'prisma_supervised' : 'prisma_assistant'
        const result = await traced({ kind, origin, event, payload, context }, () => fn(event, payload, context))
        logPrint(kind, result, context, Date.now() - started)
        return result
      } catch (error) {
        logger.error(`print.${kind}_failed`, 'La función de impresión lanzó una excepción', { duration_ms: Date.now() - started, error, metadata: { kind } })
        throw error
      }
    })
  }

  // ---- IPC: registra fallos sin cambiar el comportamiento de los manejadores ----------------
  function instrumentIpc() {
    const original = ipcMain.handle.bind(ipcMain)
    ipcMain.handle = (channel, handler) => original(channel, async (event, ...args) => {
      const started = Date.now()
      try {
        const printKind = PRINT_CHANNELS[channel]
        // En impresión, el resultado se registra DENTRO del contexto para heredar el correlation_id.
        const run = async () => {
          const value = await (printKind
            ? traced({ kind: printKind, origin: printKind === 'labels' ? 'manual_labels' : 'manual_letterhead', event, payload: args[0], context: {} }, () => handler(event, ...args))
            : handler(event, ...args))
          if (printKind) logPrint(printKind, value, {}, Date.now() - started)
          return value
        }
        const result = await (printKind ? logger.withCorrelation(null, run) : run())
        if (!printKind && CONFIG_CHANNELS.has(channel)) {
          if (result?.ok === false) logger.warn('config.change_rejected', 'Un cambio de configuración fue rechazado', { metadata: { channel } })
          else logger.info('config.changed', 'Configuración local modificada (valores no registrados)', { metadata: { channel } })
        }
        return result
      } catch (error) {
        if (ORIGIN_ERROR.test(String(error?.message || ''))) logger.warn('security.origin_rejected', 'Llamada IPC rechazada por origen no autorizado', { metadata: { channel }, error })
        else logger.error('ipc.handler_failed', 'Un manejador IPC lanzó una excepción', { duration_ms: Date.now() - started, error, metadata: { channel } })
        throw error
      }
    })
  }
  instrumentIpc()

  // ---- diagnósticos para el agente Prisma (inyectados; el agente no importa este módulo) ----
  const prismaLog = {
    log: (...a) => logger.log(...a), debug: (...a) => logger.debug(...a), info: (...a) => logger.info(...a), warn: (...a) => logger.warn(...a), error: (...a) => logger.error(...a),
    withCorrelation: (id, fn) => logger.withCorrelation(id, fn),
    withJob: (meta, fn) => jobStore.run(meta, fn),
    pollOk() {
      if (!polling) { polling = true; logger.info('polling.started', 'La estación empezó a consultar a Laravel') }
      logger.sampler.ok('poll', 'polling.recovered', 'El polling se recuperó')
    },
    pollFail(error) {
      polling = true
      logger.sampler.fail('poll', 'warn', 'polling.failed', 'Fallo al consultar a Laravel', { error })
    },
    socketFailure(error) { logger.sampler.fail('socket', 'warn', 'socket.connect_failed', 'No fue posible conectar el socket de avisos', { error }) },
    socketOk() { logger.sampler.clear('socket') },
    backendOk(action) {
      logger.sampler.clear(`auth:${action}`)
      logger.sampler.ok(`backend:${action}`, 'backend.request_recovered', 'El backend volvió a responder', { metadata: { action } })
    },
    // info: { status?, error?, timeout?, duration_ms? }
    backendFailure(action, info = {}) {
      const status = Number.isInteger(info.status) ? info.status : undefined
      const metadata = { action, http_status: status, timeout: info.timeout === true }
      if (status === 401 || status === 403) return logger.sampler.fail(`auth:${action}`, 'warn', 'security.auth_rejected', `El backend rechazó la sesión (HTTP ${status})`, { metadata, duration_ms: info.duration_ms })
      if (action === 'station/poll') return false // ya lo resume polling.failed
      const text = info.timeout ? 'Tiempo de espera agotado al llamar al backend' : status ? `El backend respondió HTTP ${status}` : 'No fue posible contactar al backend'
      return logger.sampler.fail(`backend:${action}`, status && status < 500 ? 'warn' : 'error', 'backend.request_failed', text, { metadata, duration_ms: info.duration_ms, error: info.error })
    },
  }

  // ---- ventanas autorizadas y canales logs:* -----------------------------------------------
  function attachShell(win) {
    shells.add(win.webContents)
    const stopPolling = reason => { if (polling) { polling = false; logger.info('polling.stopped', `Consulta periódica detenida (${reason})`) } }
    win.webContents.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => { if (isMainFrame) stopPolling('la ventana navegó') })
    win.webContents.once('destroyed', () => stopPolling('ventana cerrada'))
  }
  function authorize(event) {
    let origin
    try { origin = new URL(event.senderFrame.url).origin } catch { /* sin origen */ }
    if (!shells.has(event.sender) || event.senderFrame !== event.sender.mainFrame || origin !== runtimeConfig.frontendOrigin) throw Error('Origen no autorizado para consultar logs')
  }
  const failRead = (error, action) => { logger.error('log.read_failed', `No fue posible ${action} los registros`, { error }); return { ok: false, error: 'No fue posible leer los registros locales.' } }

  ipcMain.handle('logs:query', async (event, value) => {
    authorize(event)
    try { return { ok: true, ...(await queryLogs(root, value)) } } catch (error) { return failRead(error, 'leer') }
  })
  ipcMain.handle('logs:info', async event => {
    authorize(event)
    try { return { ok: true, ...(await infoLogs(root)), level: logger.config.level, retentionDays: logger.config.retentionDays, maxTotalMb: Math.round(logger.config.maxTotalBytes / 1048576), ...logger.stats() } } catch (error) { return failRead(error, 'consultar') }
  })
  ipcMain.handle('logs:export', async (event, value) => {
    authorize(event)
    const format = value?.format === 'csv' ? 'csv' : 'jsonl'
    try {
      const { items } = await queryLogs(root, value?.query, { exporting: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const win = BrowserWindow.fromWebContents(event.sender)
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Exportar registros saneados', defaultPath: `ivoolve-print-logs-${stamp}.${format}`,
        filters: [{ name: format === 'csv' ? 'CSV' : 'JSON Lines', extensions: [format] }],
      })
      if (canceled || !filePath) return { ok: true, cancelled: true }
      await fs.promises.writeFile(filePath, serialize(items, format), 'utf8')
      logger.info('log.exported', 'Registros saneados exportados', { metadata: { format, count: items.length } })
      return { ok: true, count: items.length, truncated: items.length >= LIMITS.maxExport }
    } catch (error) { return failRead(error, 'exportar') }
  })
  // Errores del renderer: lista cerrada de eventos y 20 por minuto como máximo.
  ipcMain.handle('logs:report', (event, value) => {
    authorize(event)
    const now = Date.now()
    if (now - reportWindow.start > 60000) { reportWindow.start = now; reportWindow.count = 0 }
    if (++reportWindow.count > 20 || !value || value.event !== 'ui.error_unhandled') return { ok: false }
    logger.error('ui.error_unhandled', typeof value.message === 'string' ? value.message : 'Error de interfaz', {
      component: 'frontend', process: 'renderer', error: { name: String(value.name || 'Error'), message: String(value.message || ''), stack: typeof value.stack === 'string' ? value.stack : undefined },
      metadata: { source: typeof value.source === 'string' ? value.source.slice(0, 40) : undefined },
    })
    return { ok: true }
  })

  return {
    logger, root, instrumentPrint, setPrintTrace: fn => { printTrace = typeof fn === 'function' ? fn : null }, attachShell, prismaLog, setStationId: id => logger.setStationId(id),
    correlationHeaders: () => { const id = logger.currentCorrelation(); return id ? { 'X-Correlation-Id': id } : {} },
    newCorrelationId: () => randomUUID(),
  }
}

module.exports = { create, noopLog, PRINT_CHANNELS }
