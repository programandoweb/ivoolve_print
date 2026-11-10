'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { create } = require('..')

const ORIGIN = 'https://frontend.example'
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ivoolve-desktop-log-'))

function harness() {
  const userData = tmp()
  const app = Object.assign(new EventEmitter(), { getPath: () => userData, getVersion: () => '9.9.9', isPackaged: false })
  const handlers = new Map()
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) }
  const saved = { path: null, canceled: false }
  const dialog = { showSaveDialog: async () => ({ canceled: saved.canceled, filePath: saved.path }) }
  const BrowserWindow = { fromWebContents: () => ({}) }
  const processRef = Object.assign(new EventEmitter(), { versions: { electron: '1', chrome: '2', node: '3' }, pid: 1, platform: 'win32' })
  const runtimeConfig = { frontendOrigin: ORIGIN, BACKENDS: { prod: 'x' }, SOCKETS: {} }
  const logs = create({ app, ipcMain, dialog, BrowserWindow, runtimeConfig, processRef, env: { IVOOLVE_PRINT_LOG_DIR: path.join(userData, 'logs') } })
  const contents = Object.assign(new EventEmitter(), { id: 1 })
  contents.mainFrame = { url: ORIGIN + '/dashboard' }
  const win = { webContents: contents }
  logs.attachShell(win)
  const event = (over = {}) => ({ sender: contents, senderFrame: contents.mainFrame, ...over })
  const rows = async () => {
    await logs.logger.flush()
    const dir = path.join(userData, 'logs', 'electron')
    return fs.readdirSync(dir).flatMap(n => fs.readFileSync(path.join(dir, n), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)))
  }
  return { logs, app, handlers, ipcMain, event, rows, processRef, saved, contents, userData }
}

test('arranque: app.started y config.loaded sin secretos; station_id se adjunta al fijarlo', async () => {
  const h = harness()
  h.logs.setStationId('11111111-1111-4111-8111-111111111111')
  h.logs.logger.info('app.ready', 'listo')
  const rows = await h.rows()
  assert.deepEqual(rows.slice(0, 2).map(r => r.event), ['app.started', 'config.loaded'])
  assert.equal(rows[0].metadata.version, '9.9.9'); assert.equal(rows[1].metadata.frontend_origin, ORIGIN)
  assert.equal(rows.at(-1).station_id, '11111111-1111-4111-8111-111111111111')
})

test('IPC: el resultado y los errores de un manejador NO cambian; los fallos se registran', async () => {
  const h = harness()
  const boom = Error('explotó Bearer abc.def.ghi')
  h.ipcMain.handle('x:ok', async (_e, value) => ({ ok: true, value }))
  h.ipcMain.handle('x:fail', () => { throw boom })
  assert.deepEqual(await h.handlers.get('x:ok')(h.event(), 7), { ok: true, value: 7 })
  await assert.rejects(() => h.handlers.get('x:fail')(h.event()), err => err === boom)
  const failed = (await h.rows()).filter(r => r.event === 'ipc.handler_failed')
  assert.equal(failed.length, 1); assert.equal(failed[0].metadata.channel, 'x:fail'); assert.ok(!/abc\.def\.ghi/.test(JSON.stringify(failed[0])))
})

test('IPC: "Origen ... no autorizado" se registra como evento de seguridad', async () => {
  const h = harness()
  h.ipcMain.handle('prisma:poll', () => { throw Error('Origen no autorizado.') })
  await assert.rejects(() => h.handlers.get('prisma:poll')(h.event()))
  const row = (await h.rows()).find(r => r.event === 'security.origin_rejected')
  assert.equal(row.category, 'security'); assert.equal(row.level, 'warn')
})

test('impresión: ok:true se registra como envío técnico (sin afirmar papel) y ok:false como fallo con motivo', async () => {
  const h = harness()
  h.ipcMain.handle('print-labels', async (_e, payload) => payload.fail ? { ok: false, message: 'cancelled' } : { ok: true, message: 'Impresión enviada correctamente' })
  h.ipcMain.handle('dispatch-print:run', async () => ({ ok: false, error: 'No se encontró el despacho 07 de hoy' }))
  await h.handlers.get('print-labels')(h.event(), { print: [{ title: 'SECRETO-PRODUCTO', code: '1' }] })
  await h.handlers.get('print-labels')(h.event(), { fail: true })
  await h.handlers.get('dispatch-print:run')(h.event(), { number: '07', token: 'TOKEN-SECRETO' })
  const rows = (await h.rows()).filter(r => r.category === 'printing_technical')
  assert.deepEqual(rows.map(r => r.event), ['print.labels_submitted', 'print.labels_failed', 'print.letterhead_failed'])
  assert.match(rows[0].message, /No confirma salida física/); assert.ok(rows.every(r => r.correlation_id), 'cada intento lleva correlation_id')
  assert.equal(rows[1].level, 'warn'); assert.equal(rows[2].level, 'error'); assert.match(rows[2].message, /No se encontró el despacho/)
  assert.ok(!/SECRETO/.test(JSON.stringify(rows)))
})

test('impresión: instrumentPrint propaga el correlation_id a correlationHeaders() y conserva el resultado', async () => {
  const h = harness()
  let header
  const wrapped = h.logs.instrumentPrint('labels', async () => { header = h.logs.correlationHeaders(); return { ok: true } })
  assert.deepEqual(await wrapped(h.event(), {}, { prismaSupervised: true }), { ok: true })
  assert.match(header['X-Correlation-Id'], /^[0-9a-f-]{36}$/)
  assert.deepEqual(h.logs.correlationHeaders(), {}, 'fuera de un intento no se añade cabecera')
  const rows = await h.rows()
  assert.equal(rows.find(r => r.event === 'print.labels_submitted').correlation_id, header['X-Correlation-Id'])
  assert.equal(rows.find(r => r.event === 'print.labels_submitted').metadata.supervised, true)
})

test('configuración: cambios aceptados/rechazados se registran sin valores', async () => {
  const h = harness()
  h.ipcMain.handle('beta-printers:saveProfile', async (_e, v) => v.bad ? { ok: false, error: 'x' } : { ok: true })
  await h.handlers.get('beta-printers:saveProfile')(h.event(), { name: 'Zebra Secreta' })
  await h.handlers.get('beta-printers:saveProfile')(h.event(), { bad: true })
  const rows = (await h.rows()).filter(r => r.category === 'configuration' && r.metadata?.channel)
  assert.deepEqual(rows.map(r => r.event), ['config.changed', 'config.change_rejected'])
  assert.ok(!/Zebra/.test(JSON.stringify(rows)))
})

test('excepciones: uncaughtExceptionMonitor y unhandledRejection registran sin duplicar', async () => {
  const h = harness()
  const err = Error('crash de prueba'); const realError = console.error; console.error = () => {}
  try {
    h.processRef.emit('uncaughtExceptionMonitor', err, 'uncaughtException')
    h.processRef.emit('uncaughtExceptionMonitor', err, 'uncaughtException')
    h.processRef.emit('unhandledRejection', Error('rechazo'))
  } finally { console.error = realError }
  const rows = await h.rows()
  assert.equal(rows.filter(r => r.event === 'error.uncaught_exception').length, 1)
  assert.equal(rows.filter(r => r.event === 'error.unhandled_rejection').length, 1)
})

test('prismaLog: polling registra transiciones (no cada ciclo) y la recuperación', async () => {
  const h = harness()
  for (let i = 0; i < 50; i++) h.logs.prismaLog.pollOk()
  for (let i = 0; i < 40; i++) h.logs.prismaLog.pollFail(Object.assign(Error('timeout'), { code: 'ETIMEDOUT' }))
  h.logs.prismaLog.pollOk(); h.logs.prismaLog.pollOk()
  const events = (await h.rows()).filter(r => r.category === 'polling').map(r => r.event)
  assert.deepEqual(events, ['polling.started', 'polling.failed', 'polling.failed', 'polling.failed', 'polling.failed', 'polling.failed', 'polling.failed', 'polling.recovered'])
})

test('prismaLog: errores del backend se muestrean, 401/403 son seguridad y se informa la recuperación', async () => {
  const h = harness()
  for (let i = 0; i < 10; i++) h.logs.prismaLog.backendFailure('claim', { status: 503 })
  h.logs.prismaLog.backendFailure('status', { status: 401 })
  h.logs.prismaLog.backendFailure('station/poll', { status: 503 })
  h.logs.prismaLog.backendFailure('interpret', { timeout: true })
  h.logs.prismaLog.backendOk('claim')
  const rows = await h.rows()
  assert.deepEqual(rows.filter(r => r.event === 'backend.request_failed' && r.metadata.action === 'claim').map(r => r.metadata.consecutive_failures), [1, 2, 4, 8])
  assert.equal(rows.filter(r => r.event === 'security.auth_rejected').length, 1)
  assert.equal(rows.some(r => r.metadata?.action === 'station/poll'), false, 'el poll lo resume polling.failed')
  assert.match(rows.find(r => r.metadata?.action === 'interpret').message, /Tiempo de espera/)
  assert.equal(rows.find(r => r.event === 'backend.request_recovered').metadata.previous_failures, 10)
})

test('logs:* exigen origen y ventana autorizados', async () => {
  const h = harness()
  for (const channel of ['logs:query', 'logs:info', 'logs:export', 'logs:report']) {
    const evil = h.event({ senderFrame: { url: 'https://evil.example/x' } })
    evil.sender = h.contents; evil.senderFrame.url = 'https://evil.example/x'
    await assert.rejects(() => h.handlers.get(channel)(evil, {}), /Origen no autorizado/, channel)
    const stranger = h.event({ sender: Object.assign(new EventEmitter(), { mainFrame: { url: ORIGIN } }) })
    stranger.senderFrame = stranger.sender.mainFrame
    await assert.rejects(() => h.handlers.get(channel)(stranger, {}), /Origen no autorizado/, channel)
  }
  assert.ok((await h.rows()).filter(r => r.event === 'security.origin_rejected').length >= 8)
})

test('logs:query/info: leen ambas fuentes, ignoran rutas del cliente y no filtran la ruta absoluta', async () => {
  const h = harness()
  const apiDir = path.join(h.userData, 'logs', 'api'); fs.mkdirSync(apiDir, { recursive: true })
  fs.writeFileSync(path.join(apiDir, `api-${new Date().toISOString().slice(0, 10)}.jsonl`), JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', category: 'error', event: 'api.request_failed', message: 'API falló', component: 'api', process: 'main' }) + '\n')
  h.logs.logger.warn('polling.failed', 'Electron falló')
  await h.logs.logger.flush()
  const result = await h.handlers.get('logs:query')(h.event(), { path: 'C:\\Windows\\win.ini', file: '../x', pageSize: 10 })
  assert.equal(result.ok, true)
  assert.ok(result.items.some(e => e.component === 'api') && result.items.some(e => e.component === 'electron'))
  const info = await h.handlers.get('logs:info')(h.event())
  assert.equal(info.ok, true); assert.ok(info.files >= 2); assert.equal(info.level, 'info'); assert.equal(JSON.stringify(info).includes(h.userData), false)
})

test('logs:export: escribe un archivo saneado solo si el usuario elige destino; cancelar no escribe', async () => {
  const h = harness()
  h.logs.logger.error('ipc.handler_failed', 'fallo', { metadata: { token: 'SECRETO' } })
  await h.logs.logger.flush()
  const target = path.join(h.userData, 'export.csv')
  h.saved.path = target; h.saved.canceled = true
  assert.deepEqual(await h.handlers.get('logs:export')(h.event(), { format: 'csv', query: {} }), { ok: true, cancelled: true })
  assert.equal(fs.existsSync(target), false)
  h.saved.canceled = false
  const res = await h.handlers.get('logs:export')(h.event(), { format: 'csv', query: {} })
  assert.equal(res.ok, true); assert.ok(res.count >= 3)
  const text = fs.readFileSync(target, 'utf8')
  assert.ok(text.includes('timestamp,level,category') && !text.includes('SECRETO'))
})

test('logs:report: solo ui.error_unhandled, saneado y con límite de 20 por minuto', async () => {
  const h = harness()
  assert.deepEqual(await h.handlers.get('logs:report')(h.event(), { event: 'app.stopped', message: 'falso cierre' }), { ok: false })
  for (let i = 0; i < 25; i++) await h.handlers.get('logs:report')(h.event(), { event: 'ui.error_unhandled', message: `fallo ${i} Bearer abc.def.ghi`, name: 'TypeError', source: 'window.onerror' })
  const rows = (await h.rows()).filter(r => r.event === 'ui.error_unhandled')
  assert.equal(rows.length, 20 - 1 + 0, 'el primer intento inválido también cuenta en el límite')
  assert.ok(rows.every(r => r.component === 'frontend' && r.process === 'renderer' && !/abc\.def\.ghi/.test(JSON.stringify(r))))
  assert.equal((await h.rows()).some(r => r.event === 'app.stopped'), false)
})

test('ciclo de vida: before-quit/quit dejan marca de cierre limpio', async () => {
  const h = harness()
  h.app.emit('before-quit'); h.app.emit('quit', {}, 0)
  const events = (await h.rows()).map(r => r.event)
  assert.ok(events.includes('app.stopping') && events.includes('app.stopped'))
})
