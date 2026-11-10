'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRecorder, queryPrints, serialize, describeInput, mapResult, normalizeActor, normalizeQuery, infoPrints, resolveHistoryRoot, LIMITS } = require('..')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ivoolve-hist-'))
const recorder = (root, extra = {}) => createRecorder({ root, env: {}, retention: false, ...extra })
const RANGE = () => ({ from: Date.now() - 3600_000, to: Date.now() + 3600_000 })
const LABELS = { batch_code: 'LOT-2026-114', abbreviation: 'RJ', print: [
  { title: 'Camisa Polo', code: '1001 - RJ', variant_name: 'M', quantity: 12, token: 'SECRETO' },
  { title: 'Camisa Polo', code: '1002 - RJ', variant_name: 'L', quantity: 8 },
] }

test('describeInput: etiquetas → lote, cantidades por ítem y total; sin campos ajenos', () => {
  const { document } = describeInput('labels', LABELS, {})
  assert.equal(document.batch_code, '2026-114'); assert.equal(document.total_quantity, 20); assert.equal(document.abbreviation, 'RJ')
  assert.deepEqual(document.items[0], { code: '1001 - RJ', title: 'Camisa Polo', variant: 'M', quantity: 12 })
  assert.ok(!JSON.stringify(document).includes('SECRETO'))
})

test('describeInput: membrete → número y despacho, jamás el token; trabajo supervisado trae su id y origen', () => {
  const { document, job } = describeInput('letterhead', { number: '07', token: 'TOKEN-SECRETO', backend: 'prod', dispatchId: 345 }, { jobMeta: { job_id: 91, job_source: 'whatsapp' } })
  assert.equal(document.number, '07'); assert.equal(document.dispatch_id, 345)
  assert.deepEqual(job, { job_id: 91, job_source: 'whatsapp' })
  assert.ok(!JSON.stringify({ document, job }).includes('TOKEN'))
  const big = describeInput('labels', { print: Array.from({ length: 100 }, (_, i) => ({ code: `c${i}`, quantity: 2 })) }).document
  assert.equal(big.items.length, 40); assert.equal(big.items_truncated, 60); assert.equal(big.total_quantity, 200, 'el total cuenta todas las filas')
})

test('mapResult: éxito técnico, ambiguo, cancelado y fallo con motivo', () => {
  assert.deepEqual(mapResult({ ok: true, pages: 1, scaled: false }), { status: 'submitted', result: { pages: 1, scaled: false } })
  assert.equal(mapResult({ ok: true, status: 'choose' }).status, 'ambiguous')
  assert.deepEqual(mapResult({ ok: false, message: 'cancelled' }), { status: 'cancelled', reason: 'cancelled' })
  assert.deepEqual(mapResult({ ok: false, error: 'No se encontró el despacho 07 de hoy' }), { status: 'failed', reason: 'No se encontró el despacho 07 de hoy' })
  assert.equal(mapResult(undefined).status, 'failed')
})

test('normalizeActor: id/nombre/rol acotados; sin datos → unknown', () => {
  assert.deepEqual(normalizeActor({ id: 7, name: 'María Pérez', role: 'jefe-de-corte', email: 'x@y.z', token: 'T' }), { id: '7', name: 'María Pérez', role: 'jefe-de-corte', source: 'logged_in_user' })
  assert.deepEqual(normalizeActor(null), { source: 'unknown' })
  assert.deepEqual(normalizeActor({}, 'job_requester'), { source: 'unknown' })
})

test('ciclo completo: solicitud + cierre se fusionan con quién, qué, cuándo, estado y duración', async () => {
  const root = tmp(); const rec = recorder(root); rec.setStationId('11111111-1111-4111-8111-111111111111')
  const attempt = rec.begin({ kind: 'labels', origin: 'manual_labels', actor: { value: { id: 7, name: 'María Pérez', role: 'jefe-de-corte' }, source: 'logged_in_user' }, payload: LABELS, context: {}, correlationId: 'corr-12345678' })
  attempt.finish({ ok: true }); await rec.flush()
  const res = await queryPrints(root, RANGE())
  assert.equal(res.total, 1)
  const [item] = res.items
  assert.equal(item.status, 'submitted'); assert.equal(item.actor.name, 'María Pérez'); assert.equal(item.actor.source, 'logged_in_user')
  assert.equal(item.document.batch_code, '2026-114'); assert.equal(item.document.total_quantity, 20)
  assert.equal(item.station_id, '11111111-1111-4111-8111-111111111111'); assert.equal(item.correlation_id, 'corr-12345678')
  assert.ok(item.requested_at && item.finished_at && item.duration_ms >= 0 && item.origin === 'manual_labels')
  const raw = fs.readFileSync(path.join(root, 'records', fs.readdirSync(path.join(root, 'records'))[0]), 'utf8').trim().split('\n')
  assert.equal(raw.length, 2, 'dos líneas por intento: requested + finished')
  assert.ok(!raw.join('').includes('SECRETO'))
})

test('fallo: guarda el motivo; excepción también; el cierre es idempotente', async () => {
  const root = tmp(); const rec = recorder(root)
  const a = rec.begin({ kind: 'letterhead', origin: 'manual_letterhead', actor: { value: { id: 1, name: 'Ana' } }, payload: { number: '07', token: 'T' } })
  a.finish({ ok: false, error: 'La impresión fue cancelada o falló. No se reintentó el envío.' }); a.finish({ ok: true })
  rec.begin({ kind: 'labels', origin: 'prisma_assistant', actor: {}, payload: LABELS }).fail(Error('printWindow explotó Bearer abc.def.ghi'))
  await rec.flush()
  const { items } = await queryPrints(root, RANGE())
  const byOrigin = Object.fromEntries(items.map(i => [i.origin, i]))
  assert.equal(byOrigin.manual_letterhead.status, 'failed'); assert.match(byOrigin.manual_letterhead.reason, /cancelada o falló/)
  assert.equal(byOrigin.prisma_assistant.status, 'failed'); assert.ok(!/abc\.def\.ghi/.test(byOrigin.prisma_assistant.reason))
  assert.equal(byOrigin.prisma_assistant.actor.source, 'unknown')
})

test('intento sin cierre: pendiente si es reciente, interrumpido si pasaron más de 10 minutos', async () => {
  const root = tmp(); let clock = Date.now()
  const rec = recorder(root, { now: () => new Date(clock) })
  rec.begin({ kind: 'labels', origin: 'manual_labels', actor: { value: { id: 1, name: 'Ana' } }, payload: LABELS })
  await rec.flush()
  assert.equal((await queryPrints(root, RANGE())).items[0].status, 'pending')
  const old = recorder(tmp(), { now: () => new Date(Date.now() - 30 * 60_000) })
  old.begin({ kind: 'labels', origin: 'manual_labels', actor: {}, payload: LABELS }); await old.flush()
  const r = await queryPrints(old.root, { from: Date.now() - 3600_000, to: Date.now() + 3600_000 })
  assert.equal(r.items[0].status, 'interrupted'); assert.match(r.items[0].reason, /no registró cierre/)
})

function seed() {
  const root = tmp(); const rec = recorder(root)
  const mk = (kind, origin, name, payload, result, ctx = {}) => { const a = rec.begin({ kind, origin, actor: { value: { id: name.length, name }, source: 'logged_in_user' }, payload, context: ctx }); if (result) a.finish(result) }
  mk('labels', 'manual_labels', 'María Pérez', LABELS, { ok: true })
  mk('letterhead', 'manual_letterhead', 'Ana Gómez', { number: '07' }, { ok: false, error: 'No se encontró el despacho 07' })
  mk('labels', 'prisma_supervised', 'Luis Díaz', { print: [{ code: 'X9', title: 'Pantalón', variant_name: 'S', quantity: 3 }], batch_code: 'LOT-55' }, { ok: false, message: 'cancelled' }, { jobMeta: { job_id: 12, job_source: 'whatsapp' } })
  return rec.flush().then(() => root)
}

test('consulta: filtra por tipo, estado, origen y busca por persona, lote, documento o código', async () => {
  const root = await seed(); const r = RANGE()
  assert.equal((await queryPrints(root, r)).total, 3)
  assert.equal((await queryPrints(root, { ...r, kinds: ['letterhead'] })).total, 1)
  assert.deepEqual((await queryPrints(root, { ...r, statuses: ['failed', 'cancelled'] })).items.map(i => i.status).sort(), ['cancelled', 'failed'])
  assert.equal((await queryPrints(root, { ...r, origins: ['prisma_supervised'] })).items[0].job_id, 12)
  assert.equal((await queryPrints(root, { ...r, search: 'maría' })).total, 1)
  assert.equal((await queryPrints(root, { ...r, search: '2026-114' })).total, 1)
  assert.equal((await queryPrints(root, { ...r, search: '07' })).total, 1)
  assert.equal((await queryPrints(root, { ...r, search: 'x9' })).total, 1)
  assert.equal((await queryPrints(root, { ...r, search: 'no-existe' })).total, 0)
  const all = await queryPrints(root, r)
  assert.equal(all.summary.by_status.submitted, 1); assert.equal(all.summary.total_quantity, 20, 'solo suma lo enviado correctamente')
})

test('paginación y orden: más reciente primero', async () => {
  const root = tmp(); let clock = Date.now() - 600_000
  const rec = recorder(root, { now: () => new Date(clock += 1000) })
  for (let i = 0; i < 7; i++) rec.begin({ kind: 'labels', origin: 'manual_labels', actor: { value: { id: 1, name: `U${i}` } }, payload: { print: [{ code: `c${i}`, quantity: 1 }] } }).finish({ ok: true })
  await rec.flush()
  const p1 = await queryPrints(root, { ...RANGE(), pageSize: 3 }); const p3 = await queryPrints(root, { ...RANGE(), pageSize: 3, page: 3 })
  assert.deepEqual(p1.items.map(i => i.actor.name), ['U6', 'U5', 'U4']); assert.equal(p1.hasMore, true)
  assert.deepEqual(p3.items.map(i => i.actor.name), ['U0']); assert.equal(p3.hasMore, false)
})

test('seguridad: se re-sanea al leer, se ignoran líneas corruptas y el cliente no controla rutas', async () => {
  const root = await seed()
  const file = path.join(root, 'records', fs.readdirSync(path.join(root, 'records'))[0])
  fs.appendFileSync(file, 'basura que no es json\n' + JSON.stringify({ phase: 'requested', attempt_id: '99999999-9999-4999-8999-999999999999', timestamp: new Date().toISOString(), kind: 'labels', origin: 'manual_labels', actor: { id: '1', name: 'Eva', token: 'TOKEN-EN-ARCHIVO' }, document: { items: [{ code: 'Z', quantity: 1, token: 'OTRO-TOKEN' }] } }) + '\n')
  const res = await queryPrints(root, { ...RANGE(), path: 'C:\\Windows\\win.ini', file: '../x' })
  assert.equal(res.corrupt, 1); assert.equal(res.total, 4)
  assert.ok(!JSON.stringify(res).includes('TOKEN'))
  const q = normalizeQuery({ pageSize: 99999, page: 99999, statuses: ['submitted', 'hack'], search: 'x'.repeat(500) })
  assert.equal(q.pageSize, LIMITS.maxPageSize); assert.deepEqual(q.statuses, ['submitted']); assert.equal(q.search.length, LIMITS.maxSearch)
})

test('exportación: JSONL y CSV en orden cronológico, con lote y detalle, a prueba de fórmulas', async () => {
  const root = await seed()
  const { items } = await queryPrints(root, RANGE(), { exporting: true })
  const csv = serialize(items, 'csv')
  assert.ok(csv.startsWith('\uFEFFsolicitado,finalizado,estado,motivo,tipo,origen,usuario_id,usuario,rol,fuente_usuario,lote'))
  assert.ok(csv.includes('María Pérez') && csv.includes('2026-114') && csv.includes('1001 - RJ M x12'))
  assert.equal(serialize(items, 'jsonl').trim().split('\n').length, 3)
  assert.ok(serialize([{ ...items[0], actor: { name: '=CMD()' } }], 'csv').includes("'=CMD()"))
  const info = await infoPrints(root); assert.equal(info.files, 1)
})

test('resiliencia: si el disco falla, begin/finish no lanzan (la impresión no depende del historial)', async () => {
  const blocker = path.join(tmp(), 'archivo'); fs.writeFileSync(blocker, 'x')
  const rec = recorder(path.join(blocker, 'sub'))
  const realWrite = process.stderr.write; process.stderr.write = () => true
  try {
    assert.doesNotThrow(() => rec.begin({ kind: 'labels', origin: 'manual_labels', actor: {}, payload: LABELS }).finish({ ok: true }))
    await rec.flush()
  } finally { process.stderr.write = realWrite }
  assert.ok(rec.stats().failedBatches >= 1)
})

test('raíz: variable de entorno o userData; nunca ruta fija', () => {
  assert.equal(resolveHistoryRoot({ userDataDir: path.join('a', 'b'), env: {} }), path.join('a', 'b', 'print-history'))
  assert.equal(resolveHistoryRoot({ env: { IVOOLVE_PRINT_HISTORY_DIR: path.join(os.tmpdir(), 'h') } }), path.resolve(os.tmpdir(), 'h'))
  assert.throws(() => resolveHistoryRoot({ env: {} }))
})
