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
    if (url.endsWith('/status')) return Response.json({ data: { slug: 'prisma', name: 'Prisma', enabled: options.disabled !== true, available: options.disabled !== true, configured: true, provider: 'gemini', model: 'gemini-2.5-flash', reason: options.disabled ? 'Desactivado' : null } })
    if (url.endsWith('/interpret')) return Response.json({ data: { message: 'Preparado', commands: options.work || [member('02')], requires_confirmation: false, plan_token: 'sealed', expires_at: Date.now() / 1000 + 120 } })
    if (claims.has(data.plan_token)) return Response.json({ message: 'Esta solicitud ya fue utilizada.' }, { status: 409 })
    claims.add(data.plan_token)
    return Response.json({ data: { id: 'id', date: options.date || today(), commands: options.work || [member('02')] } })
  }
  register({ ipcMain: { handle: (key, fn) => { handlers[key] = fn } }, profiles: { getPrintPlan: async (_, kind) => { profiles.push(kind); if (options.off === kind) throw Error('Perfil desactivado.') } },
    printLabels: async (_, payload) => { calls.push({ kind: 'labels', payload }); return { ok: !options.labelFail } },
    printLetterhead: async (_, value) => { calls.push({ kind: 'letterhead', value }); if (options.printWait) await options.printWait
      if (options.duplicates && !value.dispatchId) return { ok: true, status: 'choose', candidates: [{ id: 7, number: value.number, kind: 'Envío', name: 'Fixture' }, { id: 8, number: value.number, kind: 'Domicilio', name: 'Fixture 2' }] }
      return { ok: !options.memberFail, error: options.memberFail ? 'No se encontró el despacho.' : undefined }
    }, fetchImpl })(shell)
  const invoke = (action, data = {}) => handlers[`prisma:${action}`](event, { token: TOKEN, ...data })
  return { handlers, event, contents, calls, requests, profiles, invoke, execute: () => invoke('execute', { plan_token: 'sealed', confirmed: false }) }
}
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
