const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { Store, resolve, validIdentity } = require('../core')
const { inventory } = require('../inventory')
const { register } = require('../index')
const identity = { name: 'Label', driver: 'Twin', port: 'USB003', pnp: 'instance1', serial: '' }
const printer = value => ({ identity: value })
const temp = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-printers-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir }
test('identity: stable serial, collision, instance, changed queue, no match', () => {
  assert.equal(resolve(identity, [printer(identity)]).state, 'probable')
  assert.equal(resolve(identity, [printer(identity), printer({ ...identity, name: 'Copy', port: 'USB004' })]).state, 'ambiguous')
  assert.equal(resolve(identity, [printer({ ...identity, name: 'Copy' })]).state, 'not-found')
  assert.equal(resolve(identity, []).state, 'not-found')
  const serial = { ...identity, serial: 'real-serial' }
  assert.equal(resolve(serial, [printer({ ...serial, name: 'Renamed', port: 'USB009' })]).state, 'verified')
  assert.equal(resolve(serial, [printer(serial), printer(serial)]).state, 'ambiguous')
  assert.equal(validIdentity({ ...identity, command: 'anything' }), false)
  assert.equal(validIdentity({ ...identity, name: '\n' }), false)
})
test('store: off default, restart, unlink, corruption, invalid schema and failed write', t => {
  const dir = temp(t); const store = new Store(dir); const state = store.read()
  assert.equal(state.enabled, false); assert.equal(state.profiles.length, 3)
  store.write({ ...state, enabled: true, profiles: state.profiles.map((p, i) => i ? p : { ...p, identity }) })
  assert.deepEqual(new Store(dir).read(), store.state)
  assert.throws(() => store.write({ ...state, version: 2 }))
  assert.throws(() => store.write({ ...state, profiles: [state.profiles[0], state.profiles[0]] }))
  const invalid = '{broken'; fs.writeFileSync(store.file, invalid)
  const corrupt = new Store(dir); assert.equal(corrupt.read().enabled, false); assert.ok(corrupt.diagnostic); assert.equal(fs.readFileSync(store.file, 'utf8'), invalid)
  const blocked = path.join(dir, 'file'); fs.writeFileSync(blocked, 'x')
  const failure = new Store(blocked); failure.read(); assert.throws(() => failure.write({ ...failure.state, enabled: true })); assert.equal(failure.state.enabled, false)
})
test('inventory: CIM association, unknown state, enrichment failure, no invented serial', async () => {
  const contents = { getPrintersAsync: async () => [{ name: 'Label' }] }
  const result = await inventory(contents, 'win32', async () => [{ Name: 'Label', DriverName: 'Twin', PortName: 'USB003', WorkOffline: true }])
  assert.equal(result.printers[0].identity.serial, ''); assert.match(result.printers[0].status, /offline/)
  const fallback = await inventory(contents, 'win32', async () => { throw Error('private path') })
  assert.ok(fallback.diagnostic); assert.equal(fallback.printers[0].status, 'desconocido'); assert.ok(!fallback.diagnostic.includes('private'))
})
function harness(t) {
  const dir = temp(t); const handlers = {}; let created = 0; let calls = 0; let target
  class Window {
    constructor() { created++; target = this; this.webContents = { mainFrame: {}, getPrintersAsync: async () => { calls++; return [{ name: 'Label' }, { name: 'Copy' }] }, setWindowOpenHandler: () => {}, on: () => {} } }
    on() {} loadFile(file) { this.webContents.mainFrame.url = require('node:url').pathToFileURL(file).href } isDestroyed() { return false } focus() {}
  }
  let open
  const attach = register({ app: { getPath: () => dir }, BrowserWindow: Window, Menu: { buildFromTemplate: items => { open = items[0].submenu[0].click; return {} } }, ipcMain: { handle: (channel, fn) => { handlers[channel] = fn } }, dialog: { showMessageBox: () => { throw Error('Must not print') } } })
  attach({ setMenu() {}, setMenuBarVisibility() {} }); assert.equal(created, 0); assert.equal(calls, 0); open()
  const event = { sender: target.webContents, senderFrame: target.webContents.mainFrame }
  return { invoke: (name, value, source = event) => handlers[`beta-printers:${name}`](source, value), event, counts: () => calls }
}
test('IPC: exact local frame only; off means no inventory; profiles validation; ambiguity blocks print', async t => {
  const h = harness(t)
  assert.equal((await h.invoke('getStatus')).data.enabled, false)
  assert.equal((await h.invoke('refresh')).ok, false); assert.equal(h.counts(), 0)
  await assert.rejects(h.invoke('getStatus', undefined, { ...h.event, sender: {} }), /Origen/)
  await assert.rejects(h.invoke('getStatus', undefined, { ...h.event, senderFrame: { url: h.event.senderFrame.url } }), /Origen/)
  const original = h.event.senderFrame.url; h.event.senderFrame.url = 'https://ivoolve-print-frontend.vercel.app'; await assert.rejects(h.invoke('getStatus'), /Origen/); h.event.senderFrame.url = original
  assert.equal((await h.invoke('setEnabled', 'yes')).ok, false)
  assert.equal((await h.invoke('setEnabled', true)).ok, true)
  assert.equal((await h.invoke('refresh')).data.printers.length, 2)
  assert.equal((await h.invoke('saveProfile', { id: '', label: 'Etiquetas', identity: null })).ok, false)
  const saved = await h.invoke('saveProfile', { id: '', label: 'Nueva', identity }); assert.equal(saved.ok, true)
  const p = saved.data.profiles.find(p => p.label === 'Nueva')
  assert.equal((await h.invoke('saveProfile', { ...p, identity: null })).ok, true)
  assert.equal((await h.invoke('removeProfile', p.id)).ok, true)
  assert.equal((await h.invoke('testPrint', { confirmed: false, identity })).ok, false)
  assert.equal((await h.invoke('testPrint', { confirmed: true, identity: { ...identity, driver: '', port: '', pnp: '' } })).ok, false)
})
test('regression: dialog path preserves legacy HTML, payload, margins and callback logic', () => {
  const root = path.resolve(__dirname, '../../../..')
  const baseline = execFileSync('git', ['show', 'e1a758cebdf2a77e1653010e2d747fd8043776a8:apps/desktop/main.js'], { cwd: root, encoding: 'utf8' })
  const current = fs.readFileSync(path.join(root, 'apps/desktop/main.js'), 'utf8')
  const handler = source => {
    const s = source.replace(/async function printLabels\(_event, payload(?:, context = \{\})?\) \{/, "ipcMain.handle('print-labels', async (_event, payload) => {").replace("}\nipcMain.handle('print-labels', printLabels)", '})')
    return s.slice(s.indexOf("ipcMain.handle('print-labels'"), s.indexOf('app.whenReady()'))
  }
  const withoutOptIn = handler(current)
    .replace(/    const \{ options: printerOptions, css: profileCss \} = context\.prismaSupervised === true\n      \? await attachBetaPrinters\.getPrismaPrintPlan\(_event, 'labels'\)\n      : await attachBetaPrinters\.getPrintPlan\(_event\)\n\n/, '')
    .replace('          ...printerOptions,\n          ...(context.prismaSupervised === true ? { silent: false, copies: 1 } : {}),\n', '')
    .replace(/    if \(profileCss\) \{[\s\S]*?\n    \}\n\n/, '')
  assert.equal(withoutOptIn, handler(baseline))
  assert.ok(fs.readFileSync(path.join(root, 'apps/desktop/preload.js'), 'utf8').startsWith(execFileSync('git', ['show', 'e1a758cebdf2a77e1653010e2d747fd8043776a8:apps/desktop/preload.js'], { cwd: root, encoding: 'utf8' })))
})
test('test print: native cancellation, one page non-silent, single in-flight request', async t => {
  let local; let prints = []; let response = 0; const handlers = {}; let confirmPending; let release
  class Window {
    constructor() {
      this.closed = false
      this.webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {}, getPrintersAsync: async () => [{ name: 'Label' }], print: (options, cb) => { prints.push(options); cb(true) } }
      if (!local) local = this
    }
    on() {} isDestroyed() { return this.closed } close() { this.closed = true } loadFile(file) { this.webContents.mainFrame.url = require('node:url').pathToFileURL(file).href } async loadURL() {}
  }
  let open
  register({ app: { getPath: () => temp(t) }, BrowserWindow: Window, Menu: { buildFromTemplate: items => { open = items[0].submenu[0].click } }, ipcMain: { handle: (key, fn) => { handlers[key] = fn } }, dialog: { showMessageBox: async () => { if (confirmPending) await confirmPending; return { response } } } })({ setMenu() {}, setMenuBarVisibility() {} })
  open()
  const event = { sender: local.webContents, senderFrame: local.webContents.mainFrame }
  const invoke = (method, value) => handlers[`beta-printers:${method}`](event, value)
  await invoke('setEnabled', true)
  const selected = (await invoke('refresh')).data.printers[0].identity
  assert.equal((await invoke('testPrint', { identity: selected, confirmed: true })).data.cancelled, true); assert.equal(prints.length, 0)
  response = 1
  assert.equal((await invoke('testPrint', { identity: selected, confirmed: true })).data.success, true)
  assert.equal(prints.length, 1); assert.equal(prints[0].silent, false); assert.equal(prints[0].copies, 1); assert.deepEqual(prints[0].pageRanges, [{ from: 0, to: 0 }])
  confirmPending = new Promise(r => { release = r })
  const pending = invoke('testPrint', { identity: selected, confirmed: true })
  await new Promise(r => setImmediate(r))
  assert.equal((await invoke('testPrint', { identity: selected, confirmed: true })).ok, false)
  await invoke('setEnabled', false); release()
  assert.equal((await pending).ok, false); assert.equal(prints.length, 1)
})
test('Vercel launcher: only registered shell and exact HTTPS origin/top frame; no configuration access', async t => {
  const handlers = {}; let windows = 0
  class Window {
    constructor() { windows++; this.webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {} } }
    on() {} loadFile() {} isDestroyed() { return false } focus() {}
  }
  const attach = register({ app: { getPath: () => temp(t) }, BrowserWindow: Window, Menu: { buildFromTemplate() {} }, ipcMain: { handle: (key, fn) => { handlers[key] = fn } }, dialog: {} })
  const shell = { webContents: { mainFrame: { url: 'https://ivoolve-print-frontend.vercel.app/dashboard' } }, setMenu() {}, setMenuBarVisibility() {} }
  attach(shell)
  const event = { sender: shell.webContents, senderFrame: shell.webContents.mainFrame }
  const launch = handlers['beta-printers:open-settings']
  assert.deepEqual(launch(event), { ok: true }); assert.equal(windows, 1)
  launch(event); assert.equal(windows, 1)
  await assert.rejects(handlers['beta-printers:getStatus'](event), /Origen/)
  assert.throws(() => launch({ ...event, sender: { mainFrame: event.senderFrame } }), /Origen/)
  assert.throws(() => launch({ ...event, senderFrame: { url: event.senderFrame.url } }), /Origen/)
  for (const url of ['http://ivoolve-print-frontend.vercel.app', 'https://ivoolve-print-frontend.vercel.app.evil.test', 'file:///tmp/test.html']) {
    event.senderFrame.url = url; assert.throws(() => launch(event), /Origen/)
  }
})
