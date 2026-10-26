const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { register, commands } = require('../index')
const { today } = require('../../dispatch-print/service')
const TOKEN = 'fake.jwt.token'
const label = (number = '123', quantity = 3) => ({ kind: 'labels', number, quantity, payload: { print: [{ title: 'Blusa', code: number, variant_name: 'Azul', quantity, abbreviation: '' }], abbreviation: '', batch_code: number } })
const member = number => ({ kind: 'letterhead', number, quantity: 1 })
function setup(options = {}) {
  const handlers = {}; const calls = []; const requests = []; const profiles = []; const claims = new Set()
  const contents = new EventEmitter(); contents.mainFrame = { url: 'https://ivoolve-print-frontend.vercel.app/dashboard' }
  const shell = { webContents: contents }; const event = { sender: contents, senderFrame: contents.mainFrame }
  const fetchImpl = async (url, config) => {
    requests.push({ url, config }); const data = config.body ? JSON.parse(config.body) : null
    if (options.fetchWait) await options.fetchWait
    if (options.httpError) return new Response(JSON.stringify({ message: options.errorMessage || 'No disponible' }), { status: options.httpError })
    if (url.endsWith('/station/poll')) return Response.json({data: {connected: true, signals: options.signals || [{receipt_id: 10, signal_id: 3, kind: 'labels', source: 'chat', created_at: '2026-10-26 08:00:00'}]}})
    if (url.endsWith('/station/acknowledge')) return Response.json({data: {acknowledged: data.receipt_ids.length}})
    if (url.endsWith('/station/print/next')) return Response.json({data: {job: options.supervisedJob || null}})
    if (url.endsWith('/station/print/complete')) return Response.json({data: {recorded: true}})
    if (url.endsWith('/status')) return Response.json({ data: { slug: 'prisma', name: 'Prisma', enabled: options.disabled !== true, available: options.disabled !== true, configured: true, provider: 'gemini', model: 'gemini-2.5-flash', reason: options.disabled ? 'Desactivado' : null } })
    if (url.endsWith('/interpret')) return Response.json({ data: { message: 'Preparado', commands: options.work || [member('02')], requires_confirmation: false, plan_token: 'sealed', expires_at: Date.now() / 1000 + 120 } })
    if (claims.has(data.plan_token)) return Response.json({ message: 'Esta solicitud ya fue utilizada.' }, { status: 409 })
    claims.add(data.plan_token)
    return Response.json({ data: { id: 'id', date: options.date || today(), commands: options.work || [member('02')] } })
  }
  register({ ipcMain: { handle: (key, fn) => { handlers[key] = fn } }, profiles: { getPrintPlan: async (_, kind) => { profiles.push(kind); if (options.off === kind) throw Error('Perfil desactivado.') }, getPrismaPrintPlan: async (_, kind) => { profiles.push('prisma:'+kind); if (options.prismaProfileOff) throw Error('Prisma no está autorizado en el perfil local de impresora') } },
    printLabels: async (_, payload, context) => { calls.push({ kind: 'labels', payload, ...(context ? { context } : {}) }); return { ok: !options.labelFail } },
    printLetterhead: async (_, value, context) => { calls.push({ kind: 'letterhead', value, ...(context ? { context } : {}) }); if (options.printWait) await options.printWait
      if (options.duplicates && !value.dispatchId) return { ok: true, status: 'choose', candidates: [{ id: 7, number: value.number, kind: 'Envío', name: 'Fixture' }, { id: 8, number: value.number, kind: 'Domicilio', name: 'Fixture 2' }] }
      return { ok: !options.memberFail, error: options.memberFail ? 'No se encontró el despacho.' : undefined }
    }, stationId: '123e4567-e89b-12d3-a456-426614174000', fetchImpl })(shell)
  const invoke = (action, data = {}) => handlers[`prisma:${action}`](event, { token: TOKEN, ...data })
  return { handlers, event, contents, calls, requests, profiles, invoke, execute: () => invoke('execute', { plan_token: 'sealed', confirmed: false }) }
}
test('supervised WhatsApp labels automatically open the existing dialog with quantity nine only once', async () => {
  const payload = label('381', 9).payload
  const job = {id: 51, kind: 'labels', number: '381', quantity: 9, title:'Body Barbie',
    variant:'Negro', source:'whatsapp', dispatch_id:null, payload}
  const h = setup({supervisedJob:job})
  const next = await h.invoke('supervised-next')
  assert.equal(next.ok, true)
  assert.deepEqual(next.job, {id:51,kind:'labels',number:'381',quantity:9,title:'Body Barbie',variant:'Negro',source:'whatsapp'})
  assert.equal(h.calls.length, 0)
  const result = await h.invoke('supervised-execute', {job_id:51})
  assert.equal(result.status, 'submitted')
  assert.equal(h.calls.length, 1)
  assert.deepEqual(h.calls[0], {kind:'labels',payload,context:{prismaSupervised:true}})
  assert.ok(h.profiles.includes('prisma:labels'))
  assert.equal(h.requests.filter(x => x.url.endsWith('/station/print/complete')).length, 1)
  assert.equal((await h.invoke('supervised-execute',{job_id:51})).ok, false)
  assert.equal(h.calls.length, 1)
})

test('local Prisma profile disabled refuses supervised job and never touches printer handlers', async () => {
  const h = setup({supervisedJob:{id:72,kind:'letterhead',number:'01',quantity:1,
    title:'Membrete 01',variant:'',source:'chat',dispatch_id:null,payload:null},prismaProfileOff:true})
  assert.equal((await h.invoke('supervised-next')).ok, true)
  const done = await h.invoke('supervised-execute',{job_id:72})
  assert.equal(done.status,'profile_blocked')
  assert.equal(h.calls.length,0)
  assert.equal(h.requests.filter(x => x.url.endsWith('/station/print/complete')).length,1)
})

test('single request claims once, uses existing letterhead handler and never selects a printer itself', async () => {
  const h = setup()
  assert.equal((await h.invoke('interpret', { text: 'Imprime el membrete 02', history: [] })).status, 'interpreted')
  assert.equal(h.calls.length, 0)
  assert.equal((await h.execute()).status, 'completed'); assert.equal(h.calls.length, 1)
  assert.deepEqual(h.calls[0], { kind: 'letterhead', value: { number: '02', token: TOKEN } })
  assert.deepEqual(h.profiles, ['letterhead'])
  assert.equal((await h.execute()).ok, false); assert.equal(h.calls.length, 1)
  assert.ok(h.requests.every(r => r.url.startsWith('https://backend.delicetiendavirtual.com/api/v1/printing-agent/') && r.config.redirect === 'error'))
  assert.ok(h.requests.every(r => r.config.headers.Authorization === `Bearer ${TOKEN}`))
  assert.equal(JSON.parse(h.requests[0].config.body).token, undefined)
})
test('batch routes exact label payload and independent profile; first failure stops remaining documents', async () => {
  const payload = label()
  const h = setup({ work: [payload, member('02'), member('03')], memberFail: true })
  const result = await h.execute()
  assert.equal(result.status, 'stopped'); assert.equal(result.remaining, 1); assert.equal(result.results.length, 2)
  assert.deepEqual(h.calls[0].payload, payload.payload); assert.equal(h.calls.length, 2)
  assert.deepEqual(h.profiles, ['labels', 'letterhead'])
})
test('duplicate dispatch pauses entire queue; choosing resumes without replaying previous labels', async () => {
  const h = setup({ work: [label(), member('02'), label('456', 1)], duplicates: true })
  let result = await h.execute(); assert.equal(result.status, 'choose'); assert.equal(result.results.length, 1)
  assert.equal((await h.invoke('interpret', { text: 'otra solicitud', history: [] })).ok, false)
  // A failed interpret must not discard the user's pending selection.
  result = await h.invoke('choose', { dispatchId: 8 })
  assert.equal(result.status, 'completed'); assert.equal(result.results.length, 2)
  assert.equal(h.calls.filter(c => c.kind === 'labels').length, 2)
  assert.equal(h.calls[2].value.dispatchId, 8)
})
test('invalid selection, changed login, cancellation and navigation never replay a claimed job', async () => {
  for (const mode of ['bad-id', 'login', 'cancel', 'navigation']) {
    const h = setup({ work: [member('02'), label()], duplicates: true }); await h.execute()
    if (mode === 'cancel') { assert.equal((await h.invoke('cancel')).status, 'cancelled') }
    else if (mode === 'navigation') h.contents.emit('did-start-navigation', {}, 'https://else.test', false, true)
    const result = await h.invoke('choose', { dispatchId: mode === 'bad-id' ? 999 : 7, ...(mode === 'login' ? { token: 'different.token' } : {}) })
    assert.equal(result.ok, false); assert.equal(h.calls.length, 1)
    assert.equal((await h.execute()).ok, false); assert.equal(h.calls.length, 1)
  }
})
test('double Enter is blocked while busy; profile or date failures print nothing', async () => {
  let release; const waiting = new Promise(resolve => { release = resolve })
  const h = setup({ printWait: waiting }); const first = h.execute()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await h.execute()).ok, false); release(); assert.equal((await first).ok, true); assert.equal(h.calls.length, 1)
  const off = setup({ work: [label(), member('02')], off: 'letterhead' }); assert.equal((await off.execute()).ok, false); assert.equal(off.calls.length, 0)
  const old = setup({ date: '2000-01-01' }); assert.equal((await old.execute()).ok, false); assert.equal(old.calls.length, 0)
})
test('exact shell/frame/origin, bounded prompts and closed command contract', async () => {
  const h = setup()
  await assert.rejects(h.handlers['prisma:interpret']({ ...h.event, senderFrame: { url: h.event.senderFrame.url } }, {}), /Origen/)
  h.event.senderFrame.url = 'https://ivoolve-print-frontend.vercel.app.evil.test'
  await assert.rejects(h.invoke('execute'), /Origen/)
  h.event.senderFrame.url = 'https://ivoolve-print-frontend.vercel.app/dashboard'
  assert.equal((await h.invoke('interpret', { text: 'x'.repeat(1001), history: [] })).ok, false)
  assert.equal(h.requests.length, 0)
  for (const value of [[], [member('0')], [member('http://evil')], [{ ...member('02'), kind: 'shell' }], [label('123', 101)], [member('02'), member('2')], [label('123', 70), label('456', 40)], [{ ...label(), payload: { print: [] } }]]) assert.throws(() => commands(value))
})
test('auth failures, upstream debug bodies and malformed plans never touch the printer', async () => {
  const auth = setup({ httpError: 401 }); assert.match((await auth.execute()).error, /Sesión/); assert.equal(auth.calls.length, 0)
  const debug = setup({ httpError: 503, errorMessage: 'Exception https://internal.test Bearer secret' }); const result = await debug.execute()
  assert.doesNotMatch(result.error, /internal|secret|Exception/); assert.equal(debug.calls.length, 0)
  const malformed = setup({ work: [{ ...member('02'), kind: 'invoice' }] }); assert.equal((await malformed.execute()).ok, false); assert.equal(malformed.calls.length, 0)
})

test('status reads isolated backend configuration without starting a print job', async () => {
  const h = setup({disabled: true})
  const status = await h.invoke('status')
  assert.equal(status.status, 'unavailable')
  assert.equal(status.agent.slug, 'prisma')
  assert.equal(h.requests[0].config.method, 'GET')
  assert.equal(h.requests[0].config.body, undefined)
  assert.equal(h.calls.length, 0)
})

test('heartbeat and receipt of connectivity signals never access any printer handler', async () => {
  const h = setup({signals: [
    {receipt_id: 10, signal_id: 3, kind: 'labels', source: 'whatsapp', created_at: '2026-10-26 08:00:00'},
    {receipt_id: 11, signal_id: 4, kind: 'letterhead', source: 'chat', created_at: '2026-10-26 08:00:00'},
    {receipt_id: 12, signal_id: 5, kind: 'channel', source: 'print', created_at: '2026-10-26 08:00:00'},
  ]})
  const result = await h.invoke('poll')
  assert.equal(result.ok, true)
  assert.equal(result.connected, true)
  assert.deepEqual(result.signals.map(s => s.kind), ['labels', 'letterhead', 'channel'])
  const ack = await h.invoke('acknowledge', {receipt_ids: [10, 11, 12]})
  assert.equal(ack.acknowledged, 3)
  assert.equal(h.calls.length, 0)
  assert.equal(h.profiles.length, 0)
  assert.ok(h.requests.every(r => r.config.headers.Authorization === `Bearer ${TOKEN}`))
  assert.deepEqual(h.requests.map(r => new URL(r.url).pathname.split('/').pop()), ['poll', 'acknowledge'])
})
test('numbered document simulations are only polled and acknowledged; never printed', async () => {
  const h = setup({signals: [
    {receipt_id: 20, signal_id: 9, kind: 'letterhead', source: 'chat', document_number: '02', created_at: '2026-10-26 09:00:00'},
    {receipt_id: 21, signal_id: 10, kind: 'labels', source: 'whatsapp', document_number: '123', created_at: '2026-10-26 09:00:00'},
  ]})
  const polled = await h.invoke('poll')
  assert.equal(polled.ok, true)
  assert.deepEqual(polled.signals.map(signal => signal.document_number), ['02', '123'])
  assert.equal((await h.invoke('acknowledge', {receipt_ids: [20, 21]})).acknowledged, 2)
  assert.equal(h.calls.length, 0)
  assert.equal(h.profiles.length, 0)
  assert.deepEqual(h.requests.map(r => new URL(r.url).pathname.split('/').pop()), ['poll', 'acknowledge'])
})
test('regression: numbered WhatsApp letterhead 01 does not turn station offline', async () => {
  const h = setup({signals: [
    {receipt_id: 30, signal_id: 14, kind: 'letterhead', source: 'whatsapp', document_number: '01', created_at: '2026-10-26 10:20:00'},
  ]})
  const result = await h.invoke('poll')
  assert.equal(result.ok, true, result.error)
  assert.equal(result.connected, true)
  assert.equal(result.signals[0].document_number, '01')
  const ack = await h.invoke('acknowledge', {receipt_ids: [30]})
  assert.equal(ack.ok, true)
  assert.equal(ack.acknowledged, 1)
  assert.equal(h.calls.length, 0)
  assert.equal(h.profiles.length, 0)
})

test('malformed document simulation is rejected without accessing a printer or acknowledging it', async () => {
  const h = setup({signals: [{receipt_id: 20, signal_id: 9, kind: 'letterhead', source: 'chat', document_number: '../../bad', created_at: '2026-10-26 09:00:00'}]})
  assert.equal((await h.invoke('poll')).ok, false)
  assert.equal(h.calls.length, 0)
  assert.equal(h.profiles.length, 0)
  assert.equal(h.requests.length, 1)
})

test('verified named label and negative lookup notice keep Electron connected without printing', async () => {
  const h = setup({signals: [
    {receipt_id: 43, signal_id: 25, kind: 'labels', source: 'whatsapp',
      document_number: '381', lookup_status: 'found', document_title: 'Body Barbie',
      document_variant: 'Rojo', document_query: 'body barbie rojo',
      created_at: '2026-10-26 10:39:00'},
    {receipt_id: 44, signal_id: 26, kind: 'lookup', source: 'whatsapp',
      document_number: null, lookup_status: 'not_found', document_title: null,
      document_variant: null, document_query: 'Body Barbie Morado',
      created_at: '2026-10-26 10:40:00'},
    {receipt_id: 45, signal_id: 27, kind: 'lookup', source: 'chat',
      document_number: '3811', lookup_status: 'not_found', document_title: null,
      document_variant: null, document_query: 'Etiqueta 3811',
      created_at: '2026-10-26 10:40:00'},
  ]})
  const result = await h.invoke('poll')
  assert.equal(result.ok, true, result.error)
  assert.equal(result.connected, true)
  assert.deepEqual(result.signals.map(s => s.lookup_status), ['found', 'not_found', 'not_found'])
  assert.equal((await h.invoke('acknowledge', {receipt_ids: [43,44,45]})).acknowledged, 3)
  assert.equal(h.calls.length, 0)
  assert.equal(h.profiles.length, 0)
})
test('invalid lookup status is rejected without acknowledging', async () => {
  const h = setup({signals: [{receipt_id: 60, signal_id: 32, kind: 'lookup',
    lookup_status: 'printed', document_query: 'Body Barbie', source: 'whatsapp',
    created_at: '2026-10-26 10:40:00'}]})
  assert.equal((await h.invoke('poll')).ok, false)
  assert.equal(h.calls.length, 0)
  assert.equal(h.requests.length, 1)
})

test('invalid diagnostic receipt list is blocked before any API call', async () => {
  const h = setup()
  for (const ids of [[0], [-1], ['1'], [], Array(21).fill(2)]) {
    const result = await h.invoke('acknowledge', {receipt_ids: ids})
    assert.equal(result.ok, false)
  }
  assert.equal(h.requests.length, 0)
  assert.equal(h.calls.length, 0)
})
