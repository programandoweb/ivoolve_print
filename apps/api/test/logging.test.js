'use strict'
// Pruebas del logging de la API. Requieren la API compilada: `npm run build --workspace=api`.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const dist = path.join(__dirname, '..', 'dist', 'logging')
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ivoolve-api-log-'))
const rows = dir => fs.readdirSync(path.join(dir, 'api')).sort().flatMap(n => fs.readFileSync(path.join(dir, 'api', n), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)))

function child(script, dir) {
  return spawnSync(process.execPath, ['-e', script], { env: { ...process.env, IVOOLVE_PRINT_LOG_DIR: dir }, encoding: 'utf8', timeout: 20000 })
}

test('filtro: un 500 se registra con ruta (plantilla), método y correlation_id, sin cuerpo ni query, y delega en Nest', () => {
  const dir = tmp()
  const out = child(`
    const { LoggingExceptionFilter, apiLogger } = require(${JSON.stringify(dist)})
    const sent = []
    const adapter = { reply: (res, body, status) => sent.push([body, status]), isHeadersSent: () => false, end: () => {} }
    const filter = new LoggingExceptionFilter(adapter)
    const req = { method: 'POST', route: { path: '/api/print/labels' }, url: '/api/print/labels?token=SECRETO', body: { token: 'SECRETO' }, correlationId: 'corr-abcdefgh', startedAt: Date.now() - 30 }
    const host = { getType: () => 'http', switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }), getArgByIndex: () => ({}) }
    filter.catch(new Error('boom Bearer abc.def.ghi'), host)
    apiLogger.flushSync()
    console.log(JSON.stringify(sent))
  `, dir)
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /"statusCode":500/, 'la respuesta por defecto de Nest se conserva')
  const [row] = rows(dir).filter(r => r.event === 'api.request_failed')
  assert.equal(row.level, 'error'); assert.equal(row.correlation_id, 'corr-abcdefgh')
  assert.deepEqual(row.metadata, { method: 'POST', route: '/api/print/labels', http_status: 500 })
  assert.ok(row.duration_ms >= 30)
  assert.ok(!/SECRETO|abc\.def\.ghi/.test(JSON.stringify(row)))
})

test('hooks: excepción no controlada deja app.started/fatal y el proceso sigue fallando (código ≠ 0)', () => {
  const dir = tmp()
  const out = child(`
    const { installProcessHooks, apiLogger } = require(${JSON.stringify(dist)})
    installProcessHooks(); apiLogger.info('app.started', 'inicio de prueba')
    setTimeout(() => { throw new Error('fallo de prueba') }, 10)
  `, dir)
  assert.notEqual(out.status, 0, 'no se debe tragar la excepción')
  const events = rows(dir).map(r => r.event)
  assert.ok(events.includes('app.started') && events.includes('error.uncaught_exception') && events.includes('app.stopped'), events.join(','))
  assert.equal(events.filter(e => e === 'error.uncaught_exception').length, 1, 'sin duplicados')
})

test('hooks: promesa rechazada se registra como unhandled_rejection y el proceso termina como antes', () => {
  const dir = tmp()
  const out = child(`
    const { installProcessHooks } = require(${JSON.stringify(dist)})
    installProcessHooks(); Promise.reject(new Error('rechazo de prueba'))
  `, dir)
  assert.notEqual(out.status, 0)
  assert.ok(rows(dir).some(r => r.event === 'error.unhandled_rejection' && r.level === 'fatal'))
})

test('hooks: SIGTERM deja marca de cierre y la señal sigue terminando el proceso', () => {
  const dir = tmp()
  const out = child(`
    const { installProcessHooks } = require(${JSON.stringify(dist)})
    installProcessHooks(); setInterval(() => {}, 1000); setTimeout(() => process.emit('SIGTERM'), 50)
  `, dir)
  assert.notEqual(out.status, 0, 'el proceso debe terminar por la señal')
  const events = rows(dir).map(r => r.event)
  assert.ok(events.includes('system.signal_received') && events.includes('app.stopping') && events.includes('app.stopped'), events.join(','))
})

test('logger de la API: si el directorio no se puede escribir, el proceso no se rompe', () => {
  const blocker = path.join(tmp(), 'archivo'); fs.writeFileSync(blocker, 'x')
  const out = child(`
    const { apiLogger } = require(${JSON.stringify(dist)})
    for (let i = 0; i < 50; i++) apiLogger.info('app.started', 'x' + i)
    apiLogger.flush().then(() => console.log('sigue vivo'))
  `, path.join(blocker, 'sub'))
  assert.equal(out.status, 0); assert.match(out.stdout, /sigue vivo/); assert.match(out.stderr, /ivoolve-logging/)
})
