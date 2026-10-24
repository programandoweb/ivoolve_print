const { test } = require('node:test')
const assert = require('node:assert/strict')
const { client, today, dispatchDay, validateInput } = require('../service')
const token = 'a.b.c'
const day = '2026-10-24'
function fixture({ duplicate = false, changed = false, pdfHtml = false } = {}) {
  const calls = []; let details = 0
  const orders = {
    1: { id: 1, status: 'dispatch', dispatch_order_number: 2, dispatch_order_por: '2026-10-25T01:00:00.000000Z', created_at: '2026-01-01', order_number: 'SampleRef02' },
    2: { id: 2, status: 'dispatch', dispatch_order_number: 2, dispatch_order_por: '2026-10-24T17:00:00Z', order_number: 'Second' },
    3: { id: 3, status: 'dispatch', dispatch_order_number: 2, dispatch_order_por: '2026-10-23T10:00:00-05:00', created_at: '2026-10-24', order_number: 'Older' },
  }
  const json = value => new Response(JSON.stringify({ data: value }), { headers: { 'content-type': 'application/json' } })
  const fetch = async (url, options) => {
    calls.push({ url, options }); const u = new URL(url)
    assert.equal(u.origin, 'https://backend.delicetiendavirtual.com'); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error')
    if (u.pathname.endsWith('/dispatches')) {
      const page = Number(u.searchParams.get('page'))
      return json({ orders: { data: page === 1 ? [{ id: 100, Orden: 20 }, { id: 1, Orden: '02', Tipo: 'Envío', Nombre: 'Cliente' }] : [...(duplicate ? [{ id: 2, Orden: 2, Tipo: 'Domicilio' }] : []), { id: 3, Orden: 2 }], last_page: 2, next_page_url: 'https://evil.test/steal' } })
    }
    if (u.pathname.includes('/dispatches/')) {
      const id = Number(u.pathname.split('/').at(-1)); details++
      return json({ order: changed && details > 2 && id === 1 ? { ...orders[id], dispatch_order_por: '2026-10-23' } : orders[id] })
    }
    assert.ok(u.pathname.endsWith('/pdf/print-dispatch')); assert.equal(u.searchParams.get('value'), 'SampleRef02')
    assert.equal(options.headers.Authorization, undefined)
    return new Response(pdfHtml ? '<html>login</html>' : '%PDF-1.7\nfixture', { headers: { 'content-type': pdfHtml ? 'text/html' : 'application/pdf' } })
  }
  return { service: client(fetch), calls }
}
test('Bogota day handles midnight and Laravel UTC/local timestamps; no created_at fallback', () => {
  assert.equal(today(new Date('2026-10-25T01:30:00Z')), day)
  assert.equal(dispatchDay('2026-10-25T01:30:00.000000Z'), day)
  assert.equal(dispatchDay('2026-10-24 23:30:00'), day)
  assert.throws(() => dispatchDay(null)); assert.throws(() => dispatchDay('not a date'))
})
test('02 resolves exact daily number through complete pagination and downloads original PDF by order ref', async () => {
  const f = fixture(); const value = { number: '02', token }
  const result = await f.service.search(value, day)
  assert.equal(result.length, 1); assert.equal(result[0].id, 1)
  assert.equal(result[0].reference, 'SampleRef02'); assert.ok(!result.some(r => r.id === 3))
  assert.match((await f.service.download(result[0], value, day)).toString(), /^%PDF-/)
  assert.ok(f.calls.filter(c => c.url.includes('/dashboard/')).every(c => c.options.headers.Authorization === 'Bearer a.b.c'))
  assert.ok(f.calls.every(c => !c.url.includes('evil.test')))
})
test('duplicate daily numbers require selection; changed dispatch and non-PDF content are rejected', async () => {
  const duplicate = fixture({ duplicate: true }); const value = { number: '02', token }
  assert.equal((await duplicate.service.search(value, day)).length, 2)
  const changed = fixture({ changed: true }); const found = await changed.service.search(value, day)
  await assert.rejects(changed.service.download(found[0], value, day), /cambió/)
  const html = fixture({ pdfHtml: true }); const rows = await html.service.search(value, day)
  await assert.rejects(html.service.download(rows[0], value, day), /PDF válido/)
})
test('invalid input/auth/errors fail closed without credentials or arbitrary endpoints', async () => {
  for (const value of [{ number: '0', token }, { number: '02;cmd', token }, { number: '02', token: 'a\r\nHeader:x' }, { number: '02', token, dispatchId: -1 }]) assert.throws(() => validateInput(value))
  const service = client(async () => new Response('secret JWT', { status: 401 }))
  await assert.rejects(service.search({ number: '02', token }, day), /Sesión vencida/)
  const broken = client(async () => { throw Error('token=' + token) })
  await assert.rejects(broken.search({ number: '02', token }, day), error => !error.message.includes(token))
  const tooLarge = client(async () => new Response('x', { headers: { 'content-length': '3000000' } }))
  await assert.rejects(tooLarge.search({ number: '02', token }, day), /tamaño permitido/)
})
