'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createLogger, resolveRoot, LogWriter, enforceRetention, queryLogs, serialize, infoLogs, sanitize, normalizeQuery, LIMITS } = require('..')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ivoolve-log-'))
const read = file => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
const files = dir => fs.readdirSync(dir).sort()

test('resolveRoot: respeta variable, userData y nunca usa rutas fijas de una máquina', () => {
  assert.equal(resolveRoot({ env: { IVOOLVE_PRINT_LOG_DIR: path.join(os.tmpdir(), 'x') } }), path.resolve(os.tmpdir(), 'x'))
  assert.equal(resolveRoot({ userDataDir: path.join('a', 'b'), env: {} }), path.join('a', 'b', 'logs'))
  assert.equal(resolveRoot({ env: { APPDATA: path.join('C:', 'Roam') }, platform: 'win32' }), path.join('C:', 'Roam', 'desktop', 'logs'))
})

test('sanitize: redacta secretos, tokens, blobs, URLs con credenciales y rutas de usuario', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk'
  const out = sanitize.sanitizeValue({
    token: 'abc', password: 'x', Authorization: 'Bearer zzz', plan_token: 'p', payload: { a: 1 }, base64: 'AAAA', html: '<p>',
    note: `fallo con ${jwt} y Bearer abc.def.ghi y password=hunter2`,
    url: 'https://user:pw@example.com/a/b?token=abc&x=1',
    data: 'data:image/png;base64,' + 'A'.repeat(300),
    blob: 'B'.repeat(400),
    path: 'C:\\Users\\Maria\\AppData\\x.log',
    buf: Buffer.alloc(10), ok: 3, nested: { deep: { deeper: { deepest: { gone: 1 } } } },
  })
  assert.equal(out.token, '[REDACTED]'); assert.equal(out.password, '[REDACTED]'); assert.equal(out.Authorization, '[REDACTED]')
  assert.equal(out.plan_token, '[REDACTED]'); assert.equal(out.payload, '[REDACTED]'); assert.equal(out.base64, '[REDACTED]')
  assert.ok(!/eyJ/.test(out.note) && !/hunter2/.test(out.note) && !/abc\.def\.ghi/.test(out.note))
  assert.ok(!/user:pw/.test(out.url) && !/token=abc/.test(out.url) && out.url.includes('[REDACTED_QUERY]'))
  assert.match(out.data, /REDACTED_DATA_URI/); assert.match(out.blob, /REDACTED_BLOB/)
  assert.ok(!/Maria/.test(out.path))
  assert.equal(out.buf, '[binary 10 bytes]'); assert.equal(out.ok, 3)
  assert.equal(JSON.stringify(out.nested).includes('gone'), false)
})

test('sanitize: límites de tamaño, arrays y ciclos', () => {
  const circ = { a: 1 }; circ.self = circ
  assert.equal(sanitize.sanitizeValue(circ).self, '[circular]')
  assert.equal(sanitize.sanitizeValue('x'.repeat(2000)).length < 600, true)
  assert.equal(sanitize.sanitizeValue(Array.from({ length: 50 }, (_, i) => i)).length, 21)
})

test('sanitizeError: contrato name/code/message/stack y sin secretos', () => {
  const error = Object.assign(new Error('falló Bearer abc123token en https://x.io/p?token=zz'), { code: 'ETIMEDOUT' })
  const out = sanitize.sanitizeError(error)
  assert.equal(out.name, 'Error'); assert.equal(out.code, 'ETIMEDOUT')
  assert.ok(!/abc123token/.test(out.message) && !/token=zz/.test(out.message))
  assert.ok(out.stack.split('\n').length <= 12)
  assert.deepEqual(sanitize.sanitizeError('texto'), { name: 'NonError', message: 'texto' })
})

test('logger: contrato JSONL, campos opcionales omitidos, nivel por defecto info y correlación', async () => {
  const root = tmp()
  const log = createLogger({ root, component: 'electron', processName: 'main', env: {}, retention: false })
  log.debug('app.started', 'no debe escribirse')
  log.info('app.started', 'Arranque', { metadata: { pid: 1, token: 'secreto' } })
  log.withCorrelation('corr-12345678', () => log.error('backend.request_failed', 'Falla', { duration_ms: 5000.4, error: Object.assign(new Error('x'), { code: 'ETIMEDOUT' }) }))
  log.warn('nombre-invalido', 'evento fuera de formato')
  await log.close()
  const rows = read(path.join(root, 'electron', files(path.join(root, 'electron'))[0]))
  assert.equal(rows.length, 3)
  assert.equal(rows[0].event, 'app.started'); assert.equal(rows[0].category, 'execution'); assert.equal(rows[0].component, 'electron')
  assert.equal(rows[0].metadata.token, '[REDACTED]'); assert.equal('correlation_id' in rows[0], false); assert.equal('error' in rows[0], false)
  assert.match(rows[0].timestamp, /^\d{4}-\d\d-\d\dT.*Z$/)
  assert.equal(rows[1].category, 'connection'); assert.equal(rows[1].correlation_id, 'corr-12345678'); assert.equal(rows[1].duration_ms, 5000); assert.equal(rows[1].error.code, 'ETIMEDOUT')
  assert.equal(rows[2].event, 'log.invalid_event'); assert.equal(rows[2].metadata.original_event, 'nombre-invalido')
})

test('logger: debug solo si IVOOLVE_PRINT_LOG_LEVEL=debug', async () => {
  const root = tmp()
  const log = createLogger({ root, component: 'api', env: { IVOOLVE_PRINT_LOG_LEVEL: 'debug' }, retention: false })
  log.debug('app.started', 'visible')
  await log.close()
  assert.equal(read(path.join(root, 'api', files(path.join(root, 'api'))[0])).length, 1)
})

test('logger: deduplica la misma excepción en capturas múltiples y nunca lanza', async () => {
  const root = tmp()
  const log = createLogger({ root, component: 'electron', env: {}, retention: false })
  const err = new Error('boom')
  assert.equal(log.error('ipc.handler_failed', 'primero', { error: err }), true)
  assert.equal(log.fatal('error.uncaught_exception', 'repetido', { error: err, dedupe: true }), false)
  const hostile = { get message() { throw new Error('getter hostil') } }
  assert.doesNotThrow(() => log.error('ipc.handler_failed', 'x', { error: hostile, metadata: { circular: (() => { const o = {}; o.o = o; return o })() } }))
  await log.close()
  assert.equal(read(path.join(root, 'electron', files(path.join(root, 'electron'))[0])).filter(r => r.event === 'error.uncaught_exception').length, 0)
})

test('sampler: no registra cada fallo (potencias de 2) y reporta recuperación una vez', async () => {
  const root = tmp()
  const log = createLogger({ root, component: 'electron', env: {}, retention: false })
  for (let i = 0; i < 100; i++) log.sampler.fail('poll', 'warn', 'polling.failed', 'fallo')
  log.sampler.ok('poll', 'polling.recovered', 'recuperado')
  log.sampler.ok('poll', 'polling.recovered', 'no debe repetirse')
  await log.close()
  const rows = read(path.join(root, 'electron', files(path.join(root, 'electron'))[0]))
  const failed = rows.filter(r => r.event === 'polling.failed').map(r => r.metadata.consecutive_failures)
  assert.deepEqual(failed, [1, 2, 4, 8, 16, 32, 64])
  const rec = rows.filter(r => r.event === 'polling.recovered')
  assert.equal(rec.length, 1); assert.equal(rec[0].metadata.previous_failures, 100)
})

test('writer: rotación por tamaño y reanudación del archivo del día', async () => {
  const dir = path.join(tmp(), 'electron')
  const w = new LogWriter({ dir, prefix: 'electron', maxFileBytes: 400, flushMs: 5 })
  for (let i = 0; i < 20; i++) { w.write(JSON.stringify({ i, pad: 'x'.repeat(60) })); await w.flush() }
  await w.close()
  const names = files(dir)
  assert.ok(names.length > 3, 'debe haber varios archivos')
  assert.ok(names.every(n => /^electron-\d{4}-\d{2}-\d{2}(\.\d+)?\.jsonl$/.test(n)))
  const total = names.flatMap(n => read(path.join(dir, n))).length
  assert.equal(total, 20)
  const w2 = new LogWriter({ dir, prefix: 'electron', maxFileBytes: 400, flushMs: 5 })
  w2.write('{"i":99}'); await w2.close()
  assert.equal(names.length <= files(dir).length, true)
})

test('writer: backpressure descarta, cuenta y avisa en el siguiente log disponible; write() no bloquea', async () => {
  const root = tmp()
  const w = new LogWriter({ dir: path.join(root, 'api'), prefix: 'api', maxQueue: 10, flushMs: 5, noticeFactory: n => JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', category: 'system', event: 'log.events_dropped', message: 'drop', metadata: { dropped: n } }) })
  const t0 = Date.now()
  for (let i = 0; i < 1000; i++) w.write(JSON.stringify({ i }))
  assert.ok(Date.now() - t0 < 200, 'encolar 1000 eventos debe ser casi instantáneo')
  assert.equal(w.stats().dropped, 990)
  await w.close()
  const rows = read(path.join(root, 'api', files(path.join(root, 'api'))[0]))
  assert.equal(rows.length, 11)
  assert.equal(rows.at(-1).event, 'log.events_dropped'); assert.equal(rows.at(-1).metadata.dropped, 990)
})

test('writer: si el disco falla la operación continúa y no hay bucle (solo stderr)', async () => {
  const blocker = path.join(tmp(), 'archivo')
  fs.writeFileSync(blocker, 'no soy un directorio')
  const w = new LogWriter({ dir: path.join(blocker, 'sub'), prefix: 'electron', flushMs: 5, noticeFactory: () => null })
  const realWrite = process.stderr.write; let noise = 0
  process.stderr.write = () => { noise++; return true }
  try {
    assert.equal(w.write('{"a":1}'), true)
    await w.flush()
    w.write('{"a":2}'); await w.flush()
  } finally { process.stderr.write = realWrite }
  assert.equal(w.stats().failedBatches >= 1, true); assert.equal(noise, 1, 'aviso limitado a uno por minuto')
})

test('retención: borra por antigüedad y por tamaño total, nunca el archivo de hoy', async () => {
  const root = tmp(); const now = Date.UTC(2026, 10, 10)
  const mk = (writer, day, size, seq = 0) => { const d = path.join(root, writer); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${writer}-${day}${seq ? '.' + seq : ''}.jsonl`), 'x'.repeat(size)) }
  mk('electron', '2026-10-01', 100); mk('electron', '2026-11-08', 100); mk('electron', '2026-11-10', 100); mk('api', '2026-11-09', 100); mk('api', '2026-11-10', 100)
  fs.writeFileSync(path.join(root, 'electron', 'ajeno.txt'), 'no tocar')
  const age = await enforceRetention(root, { retentionDays: 14, maxTotalBytes: 1e9, now })
  assert.equal(age.deleted, 1); assert.ok(!fs.existsSync(path.join(root, 'electron', 'electron-2026-10-01.jsonl')))
  const size = await enforceRetention(root, { retentionDays: 14, maxTotalBytes: 250, now })
  assert.ok(fs.existsSync(path.join(root, 'electron', 'electron-2026-11-10.jsonl')) && fs.existsSync(path.join(root, 'api', 'api-2026-11-10.jsonl')))
  assert.ok(size.deleted >= 1); assert.ok(fs.existsSync(path.join(root, 'electron', 'ajeno.txt')))
})

function seed(root) {
  const base = Date.parse('2026-11-10T12:00:00.000Z')
  const rows = (writer, comp, spec) => {
    const dir = path.join(root, writer); fs.mkdirSync(dir, { recursive: true })
    const lines = spec.map(([sec, level, category, event, message, extra]) => JSON.stringify({ timestamp: new Date(base + sec * 1000).toISOString(), level, category, event, message, component: comp, process: 'main', ...extra }))
    fs.appendFileSync(path.join(dir, `${writer}-2026-11-10.jsonl`), lines.join('\n') + '\n')
  }
  rows('electron', 'electron', [[0, 'info', 'execution', 'app.started', 'Arranque'], [10, 'error', 'connection', 'backend.request_failed', 'Timeout backend', { correlation_id: 'cid-0000001', error: { name: 'TimeoutError', code: 'ETIMEDOUT' } }], [30, 'warn', 'polling', 'polling.failed', 'Polling falla']])
  rows('api', 'api', [[5, 'info', 'execution', 'api.listening', 'API lista'], [20, 'error', 'error', 'api.request_failed', 'Error 500', { metadata: { token: 'SECRETO-EN-ARCHIVO' } }]])
  fs.appendFileSync(path.join(root, 'api', 'api-2026-11-10.jsonl'), 'esto no es json\n')
  return base
}

test('reader: mezcla ambas fuentes en orden cronológico inverso, filtra y pagina sin cargar de más', async () => {
  const root = tmp(); const base = seed(root)
  const range = { from: base - 1000, to: base + 60000 }
  const all = await queryLogs(root, { ...range, pageSize: 2 })
  assert.deepEqual(all.items.map(e => e.event), ['polling.failed', 'api.request_failed']); assert.equal(all.total, 5); assert.equal(all.hasMore, true); assert.equal(all.corrupt, 1)
  const page3 = await queryLogs(root, { ...range, pageSize: 2, page: 3 }); assert.equal(page3.items.length, 1); assert.equal(page3.hasMore, false)
  assert.deepEqual((await queryLogs(root, { ...range, levels: ['error'] })).items.map(e => e.event), ['api.request_failed', 'backend.request_failed'])
  assert.deepEqual((await queryLogs(root, { ...range, categories: ['connection'] })).items.map(e => e.event), ['backend.request_failed'])
  assert.deepEqual((await queryLogs(root, { ...range, components: ['api'] })).items.map(e => e.event), ['api.request_failed', 'api.listening'])
  assert.equal((await queryLogs(root, { ...range, search: 'cid-0000001' })).total, 1)
  assert.equal((await queryLogs(root, { ...range, search: 'etimedout' })).total, 1)
  assert.equal((await queryLogs(root, { from: base + 15000, to: base + 25000 })).total, 1)
})

test('reader: re-saneado al leer (un archivo manipulado no filtra secretos) y sin rutas del cliente', async () => {
  const root = tmp(); const base = seed(root)
  const res = await queryLogs(root, { from: base - 1000, to: base + 60000, search: 'error 500' })
  assert.equal(res.items[0].metadata.token, '[REDACTED]')
  assert.equal(JSON.stringify(res).includes('SECRETO-EN-ARCHIVO'), false)
  const evil = await queryLogs(root, { path: '../../etc/passwd', file: 'C:\\Windows\\win.ini', from: base - 1000, to: base + 60000 })
  assert.equal(evil.total, 5)
})

test('reader: validación de parámetros y límites', () => {
  const q = normalizeQuery({ pageSize: 99999, page: 99999, search: 'x'.repeat(500), levels: ['error', 'hack'], categories: 'no' })
  assert.equal(q.pageSize, LIMITS.maxPageSize); assert.ok(q.page * q.pageSize <= LIMITS.maxWindow)
  assert.equal(q.search.length, LIMITS.maxSearch); assert.deepEqual(q.levels, ['error']); assert.equal(q.categories, null)
})

test('exportación: JSONL y CSV saneados, cronológicos y a prueba de inyección de fórmulas', async () => {
  const root = tmp(); const base = seed(root)
  const { items } = await queryLogs(root, { from: base - 1000, to: base + 60000 }, { exporting: true })
  const jsonl = serialize(items, 'jsonl').trim().split('\n').map(JSON.parse)
  assert.deepEqual(jsonl.map(e => e.event), ['app.started', 'api.listening', 'backend.request_failed', 'api.request_failed', 'polling.failed'])
  assert.equal(serialize(items, 'jsonl').includes('SECRETO-EN-ARCHIVO'), false)
  const csv = serialize([{ ...items[0], message: '=HYPERLINK("http://x")' }], 'csv')
  assert.ok(csv.startsWith('\uFEFFtimestamp,level,category')); assert.ok(csv.includes('\'=HYPERLINK'))
  assert.deepEqual(Object.keys((await infoLogs(root)).writers), ['electron', 'api'])
})

test('volumen sostenido: 20 000 eventos con límites, sin bloquear el hilo y sin crecer sin control', async () => {
  const root = tmp()
  const log = createLogger({ root, component: 'electron', env: { IVOOLVE_PRINT_LOG_FILE_MB: '1' }, retention: false })
  let maxGap = 0; let last = Date.now()
  const ticker = setInterval(() => { const n = Date.now(); maxGap = Math.max(maxGap, n - last); last = n }, 5)
  for (let batch = 0; batch < 20; batch++) {
    for (let i = 0; i < 1000; i++) log.info('app.started', `evento ${i}`, { metadata: { i, pad: 'y'.repeat(100) } })
    await new Promise(r => setImmediate(r))
  }
  await log.close(); clearInterval(ticker)
  const rows = files(path.join(root, 'electron')).flatMap(n => read(path.join(root, 'electron', n)))
  const notices = rows.filter(r => r.event === 'log.events_dropped')
  const stored = rows.length - notices.length
  const reportedDropped = notices.reduce((sum, r) => sum + r.metadata.dropped, 0)
  assert.equal(stored + reportedDropped, 20000, 'cada evento queda guardado o contabilizado como descartado')
  assert.ok(stored > 0)
  const sizes = files(path.join(root, 'electron')).map(n => fs.statSync(path.join(root, 'electron', n)).size)
  assert.ok(Math.max(...sizes) <= 3 * 1024 * 1024, 'ningún archivo crece sin control')
  assert.ok(maxGap < 1500, `el hilo no debe bloquearse (gap ${maxGap}ms)`)
})
