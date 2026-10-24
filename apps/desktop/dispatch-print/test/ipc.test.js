const { test } = require('node:test')
const assert = require('node:assert/strict')
const { register, assetPath } = require('../index')
const { defaults, paperOptions } = require('../../beta-printers/paper')
const DOCUMENT = 'ivoolve-dispatch://print/pdf-print.html'
function setup({ duplicate = false, silent = true, printSuccess = true, rendererFail = false, profileOff = false } = {}) {
  const handlers = {}; const windows = []; const prints = []; let fetches = 0; const kinds = []
  const paper = defaults('Membretes')
  class Window {
    constructor() { windows.push(this); this.webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {}, print: (options, cb) => { prints.push(options); cb(printSuccess) } } }
    on() {} isDestroyed() { return this.closed === true } close() { this.closed = true }
    async loadURL(url) {
      this.webContents.mainFrame.url = url
      const event = { sender: this.webContents, senderFrame: this.webContents.mainFrame }
      const data = handlers['dispatch-pdf:load'](event)
      assert.equal(Buffer.from(data.bytes).toString().startsWith('%PDF-'), true)
      assert.equal(data.paper.widthMm, 101)
      assert.throws(() => handlers['dispatch-pdf:load'](event), /ya entregado/)
      handlers['dispatch-pdf:ready'](event, rendererFail ? { ok: false } : { ok: true, pages: 1, scaled: true })
    }
  }
  const profiles = { getPrintPlan: async (_, kind) => { kinds.push(kind); if (profileOff) throw Error('Perfil de impresión desactivado.')
    return { options: { ...(silent ? { silent: true, deviceName: 'Membretes 2026' } : {}), ...paperOptions(paper, silent) }, css: '', paper } } }
  const fetchImpl = async url => {
    fetches++; const u = new URL(url)
    const json = data => new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } })
    if (u.pathname.endsWith('/dispatches')) return json({ orders: { data: [{ id: 1, Orden: 2 }, ...(duplicate ? [{ id: 2, Orden: 2 }] : [])], last_page: 1 } })
    if (u.pathname.includes('/dispatches/')) { const id = Number(u.pathname.split('/').at(-1)); return json({ order: { id, status: 'dispatch', order_number: 'Order' + id, dispatch_order_number: 2, dispatch_order_por: '2026-10-24T18:00:00Z' } }) }
    return new Response('%PDF-1.7\nfixture', { headers: { 'content-type': 'application/pdf' } })
  }
  let protocolHandler
  const attach = register({ BrowserWindow: Window, profiles, ipcMain: { handle: (key, fn) => { handlers[key] = fn } }, protocol: { handle: (_, fn) => { protocolHandler = fn } }, net: { fetch: async () => new Response('asset') }, fetchImpl, now: () => new Date('2026-10-24T20:00:00Z') })
  const shell = { webContents: { mainFrame: { url: 'https://ivoolve-print-frontend.vercel.app/dashboard' } } }; attach(shell)
  const event = { sender: shell.webContents, senderFrame: shell.webContents.mainFrame }
  return { handlers, event, prints, windows, kinds, protocolHandler, fetches: () => fetches, run: value => handlers['dispatch-print:run'](event, { number: '02', token: 'a.b.c', ...value }) }
}
test('dispatcher prints original PDF once using Membretes mode, exact device and local renderer', async () => {
  for (const silent of [false, true]) {
    const h = setup({ silent }); const result = await h.run({})
    assert.equal(result.status, 'printed'); assert.equal(h.prints.length, 1)
    assert.equal(h.prints[0].silent, silent); assert.equal(h.prints[0].copies, 1)
    assert.equal(h.prints[0].deviceName, silent ? 'Membretes 2026' : undefined)
    assert.ok(h.kinds.every(kind => kind === 'letterhead')); assert.equal(h.windows[0].closed, true)
  }
})
test('ambiguous daily number requires choosing, invalid selection prints nothing, source is rechecked', async () => {
  const h = setup({ duplicate: true })
  const choice = await h.run({}); assert.equal(choice.status, 'choose'); assert.equal(choice.candidates.length, 2)
  assert.equal('reference' in choice.candidates[0], false); assert.equal(h.prints.length, 0)
  assert.equal((await h.run({ dispatchId: 999 })).ok, false); assert.equal(h.prints.length, 0)
  assert.equal((await h.run({ dispatchId: 2 })).ok, true); assert.equal(h.prints.length, 1)
})
test('double Enter, disabled profile, renderer failure and print cancellation never duplicate', async () => {
  const h = setup(); const first = h.run({}); const second = await h.run({})
  assert.equal(second.ok, false); await first; assert.equal(h.prints.length, 1)
  const off = setup({ profileOff: true }); assert.equal((await off.run({})).ok, false); assert.equal(off.fetches(), 0)
  const bad = setup({ rendererFail: true }); assert.equal((await bad.run({})).ok, false); assert.equal(bad.prints.length, 0); assert.equal(bad.windows[0].closed, true)
  const cancel = setup({ printSuccess: false }); assert.equal((await cancel.run({})).ok, false); assert.equal(cancel.prints.length, 1)
})
test('IPC main-frame/origin ownership; protocol serves only fixed local assets', async () => {
  const h = setup()
  await assert.rejects(h.handlers['dispatch-print:run']({ ...h.event, senderFrame: { url: h.event.senderFrame.url } }, {}), /Origen/)
  h.event.senderFrame.url = 'https://ivoolve-print-frontend.vercel.app.evil.test'
  await assert.rejects(h.run({}), /Origen/)
  assert.throws(() => h.handlers['dispatch-pdf:load'](h.event), /Origen PDF/)
  assert.equal(assetPath('ivoolve-dispatch://print/main.js', '/package'), null)
  assert.equal(assetPath('ivoolve-dispatch://print/standard_fonts/../../main.js', '/package'), null)
  assert.equal(assetPath('ivoolve-dispatch://print/pdf.mjs?secret=1', '/package'), null)
  assert.equal((await h.protocolHandler({ method: 'POST', url: DOCUMENT })).status, 404)
  assert.equal((await h.protocolHandler({ method: 'GET', url: DOCUMENT })).status, 200)
})
