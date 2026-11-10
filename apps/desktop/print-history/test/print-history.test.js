'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { create: createHistory } = require('..')
const { create: createLogs } = require('../../logging')

const ORIGIN = 'https://frontend.example'
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ivoolve-hist-desktop-'))

function harness() {
  const userData = tmp()
  const app = Object.assign(new EventEmitter(), { getPath: () => userData, getVersion: () => '1', isPackaged: false })
  const handlers = new Map()
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) }
  const saved = { path: path.join(userData, 'export.csv'), canceled: false }
  const dialog = { showSaveDialog: async () => ({ canceled: saved.canceled, filePath: saved.path }) }
  const BrowserWindow = { fromWebContents: () => ({}) }
  const processRef = Object.assign(new EventEmitter(), { versions: {}, pid: 1, platform: 'win32' })
  const runtimeConfig = { frontendOrigin: ORIGIN, BACKENDS: {}, SOCKETS: {} }
  const env = { IVOOLVE_PRINT_LOG_DIR: path.join(userData, 'logs') }
  const logs = createLogs({ app, ipcMain, dialog, BrowserWindow, runtimeConfig, processRef, env })
  const history = createHistory({ app, ipcMain, dialog, BrowserWindow, runtimeConfig, processRef, env })
  logs.setPrintTrace(history.trace)
  const contents = Object.assign(new EventEmitter(), {}); contents.mainFrame = { url: ORIGIN + '/dashboard' }
  history.attachShell({ webContents: contents }); logs.attachShell({ webContents: contents })
  const event = () => ({ sender: contents, senderFrame: contents.mainFrame })
  const query = async (extra = {}) => { await history.recorder.flush(); return handlers.get('print-history:query')(event(), { from: Date.now() - 3600_000, to: Date.now() + 3600_000, ...extra }) }
  return { handlers, ipcMain, logs, history, event, query, contents, saved, userData }
}

const LABELS = { batch_code: 'LOT-77', abbreviation: 'AB', print: [{ title: 'Falda', code: '55 - AB', variant_name: 'M', quantity: 5 }] }

test('canal manual print-labels: registra quién (usuario logueado), qué, lote y resultado; el resultado NO cambia', async () => {
  const h = harness()
  h.ipcMain.handle('print-labels', async () => ({ ok: true, message: 'Impresión enviada correctamente' }))
  assert.deepEqual(await h.handlers.get('print-history:set-actor')(h.event(), { id: 12, name: 'María Pérez', role: 'jefe-de-corte', email: 'x@y.z', token: 'T' }), { ok: true })
  const result = await h.handlers.get('print-labels')(h.event(), LABELS)
  assert.deepEqual(result, { ok: true, message: 'Impresión enviada correctamente' })
  const { items, total } = await h.query()
  assert.equal(total, 1)
  assert.equal(items[0].actor.name, 'María Pérez'); assert.equal(items[0].actor.id, '12'); assert.equal(items[0].actor.source, 'logged_in_user')
  assert.equal(items[0].origin, 'manual_labels'); assert.equal(items[0].status, 'submitted'); assert.equal(items[0].document.batch_code, '77')
  assert.equal(items[0].document.total_quantity, 5); assert.match(items[0].correlation_id, /^[0-9a-f-]{36}$/)
  assert.ok(!JSON.stringify(items).includes('x@y.z'), 'el correo no se guarda')
})

test('membrete manual: guarda número, motivo del fallo y quién; sin token', async () => {
  const h = harness()
  h.ipcMain.handle('dispatch-print:run', async () => ({ ok: false, error: 'No se encontró el despacho 07 de hoy (2026-11-10).' }))
  await h.handlers.get('print-history:set-actor')(h.event(), { id: 3, name: 'Ana Gómez' })
  await h.handlers.get('dispatch-print:run')(h.event(), { number: '07', token: 'TOKEN-SECRETO', backend: 'prod' })
  const { items } = await h.query()
  assert.equal(items[0].kind, 'letterhead'); assert.equal(items[0].document.number, '07'); assert.equal(items[0].status, 'failed')
  assert.match(items[0].reason, /No se encontró el despacho 07/); assert.equal(items[0].actor.name, 'Ana Gómez')
  assert.ok(!JSON.stringify(items).includes('TOKEN'))
})

test('Prisma supervisado: el pedidor del trabajo (Laravel) tiene prioridad; si no, el usuario logueado', async () => {
  const h = harness()
  await h.handlers.get('print-history:set-actor')(h.event(), { id: 3, name: 'Operaria Logueada' })
  const seen = []
  const spy = h.logs.instrumentPrint('labels', async (_e, _p, context) => { seen.push(context); return { ok: true } })
  // Camino real: el agente Prisma entrega los metadatos del trabajo por withJob, no por los argumentos.
  await h.logs.prismaLog.withJob({ job_id: 41, job_source: 'whatsapp', requested_by: { id: 99, name: 'Camila Vendedora' } }, () => spy(h.event(), LABELS, { prismaSupervised: true, prismaConfirmed: true }))
  await h.logs.prismaLog.withJob({ job_id: 42, job_source: 'print' }, () => spy(h.event(), LABELS, { prismaSupervised: true, prismaConfirmed: false }))
  assert.deepEqual(seen, [{ prismaSupervised: true, prismaConfirmed: true }, { prismaSupervised: true, prismaConfirmed: false }], 'la función de impresión recibe EXACTAMENTE el mismo contexto de siempre')
  const { items } = await h.query()
  const byJob = Object.fromEntries(items.map(i => [i.job_id, i]))
  assert.equal(byJob[41].actor.name, 'Camila Vendedora'); assert.equal(byJob[41].actor.source, 'job_requester')
  assert.equal(byJob[42].actor.name, 'Operaria Logueada'); assert.equal(byJob[42].actor.source, 'logged_in_user')
  assert.equal(byJob[41].origin, 'prisma_supervised'); assert.equal(byJob[41].job_source, 'whatsapp'); assert.equal(byJob[41].silent, true)
})

test('asistente Prisma (no supervisado) y fallo por excepción: se registra y la excepción se propaga igual', async () => {
  const h = harness()
  const boom = Error('boom')
  const failing = h.logs.instrumentPrint('letterhead', async () => { throw boom })
  await assert.rejects(() => failing(h.event(), { number: '09' }, {}), err => err === boom)
  const ok = h.logs.instrumentPrint('labels', async () => ({ ok: false, message: 'cancelled' }))
  assert.deepEqual(await ok(h.event(), LABELS, {}), { ok: false, message: 'cancelled' })
  const { items } = await h.query()
  assert.deepEqual(items.map(i => [i.origin, i.status]).sort(), [['prisma_assistant', 'cancelled'], ['prisma_assistant', 'failed']])
  assert.equal(items.find(i => i.status === 'failed').actor.source, 'unknown', 'sin usuario informado queda como desconocido, no inventado')
})

test('si el historial falla, la impresión sigue y devuelve lo mismo', async () => {
  const h = harness()
  h.history.recorder.begin = () => { throw Error('disco lleno') }
  h.ipcMain.handle('print-labels', async () => ({ ok: true }))
  assert.deepEqual(await h.handlers.get('print-labels')(h.event(), LABELS), { ok: true })
})

test('los canales exigen origen y ventana autorizados; set-actor(null) cierra sesión', async () => {
  const h = harness()
  for (const channel of ['print-history:set-actor', 'print-history:query', 'print-history:info', 'print-history:export']) {
    const evil = { sender: h.contents, senderFrame: { url: 'https://evil.example/x' } }
    await assert.rejects(() => h.handlers.get(channel)(evil, {}), /Origen no autorizado/, channel)
    const stranger = { sender: Object.assign(new EventEmitter(), { mainFrame: { url: ORIGIN } }) }; stranger.senderFrame = stranger.sender.mainFrame
    await assert.rejects(() => h.handlers.get(channel)(stranger, {}), /Origen no autorizado/, channel)
  }
  await h.handlers.get('print-history:set-actor')(h.event(), { id: 1, name: 'Ana' })
  await h.handlers.get('print-history:set-actor')(h.event(), null)
  h.ipcMain.handle('print-labels', async () => ({ ok: true }))
  await h.handlers.get('print-labels')(h.event(), LABELS)
  assert.equal((await h.query()).items[0].actor.source, 'unknown')
  assert.deepEqual(await h.handlers.get('print-history:set-actor')(h.event(), { role: 'solo-rol' }), { ok: false })
})

test('exportación: pide destino; cancelar no escribe; el CSV trae quién, lote y estado', async () => {
  const h = harness()
  h.ipcMain.handle('print-labels', async () => ({ ok: true }))
  await h.handlers.get('print-history:set-actor')(h.event(), { id: 5, name: 'Luis Díaz' })
  await h.handlers.get('print-labels')(h.event(), LABELS)
  await h.history.recorder.flush()
  h.saved.canceled = true
  assert.deepEqual(await h.handlers.get('print-history:export')(h.event(), { format: 'csv', query: {} }), { ok: true, cancelled: true })
  assert.equal(fs.existsSync(h.saved.path), false)
  h.saved.canceled = false
  const res = await h.handlers.get('print-history:export')(h.event(), { format: 'csv', query: {} })
  assert.equal(res.ok, true); assert.equal(res.count, 1)
  const csv = fs.readFileSync(h.saved.path, 'utf8')
  assert.ok(csv.includes('Luis Díaz') && csv.includes('submitted') && csv.includes('77') && csv.includes('55 - AB M x5'))
  const info = await h.handlers.get('print-history:info')(h.event())
  assert.equal(info.ok, true); assert.equal(info.files, 1); assert.equal(info.retentionDays, 365); assert.equal(JSON.stringify(info).includes(h.userData), false)
})

test('los logs técnicos y el historial son independientes (carpetas y contenido distintos)', async () => {
  const h = harness()
  h.ipcMain.handle('print-labels', async () => ({ ok: true }))
  await h.handlers.get('print-history:set-actor')(h.event(), { id: 5, name: 'Luis Díaz' })
  await h.handlers.get('print-labels')(h.event(), LABELS)
  await h.history.recorder.flush(); await h.logs.logger.flush()
  assert.ok(fs.existsSync(path.join(h.userData, 'print-history', 'records')))
  const logText = fs.readdirSync(path.join(h.userData, 'logs', 'electron')).map(n => fs.readFileSync(path.join(h.userData, 'logs', 'electron', n), 'utf8')).join('')
  assert.ok(logText.includes('print.labels_submitted'), 'el log técnico sigue funcionando')
  assert.ok(!logText.includes('Luis Díaz'), 'el nombre del usuario NO va a los logs técnicos')
})
