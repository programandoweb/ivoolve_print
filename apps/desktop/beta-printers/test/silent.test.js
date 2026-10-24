const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const { Store } = require('../core')
const { silentOptions } = require('../silent')
const identity = { name: 'Labels', driver: '', port: '', pnp: '', serial: '' }
const state = { enabled: true, silentEnabled: true, silentProfileId: 'label', profiles: [{ id: 'label', label: 'Etiquetas', identity }] }
const temp = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silent-printers-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir }

test('silent choice: OFF unchanged; selected profile only; missing/ambiguous/offline rejected', () => {
  const printers = [{ identity, status: 'desconocido' }]
  assert.deepEqual(silentOptions({ ...state, silentEnabled: false }, []), {})
  assert.deepEqual(silentOptions({ ...state, enabled: false }, []), {})
  assert.deepEqual(silentOptions(state, printers), { silent: true, deviceName: 'Labels' })
  assert.throws(() => silentOptions({ ...state, silentProfileId: 'missing' }, printers), /perfil vinculado/)
  assert.throws(() => silentOptions(state, []), /no encontrada o ambigua/)
  assert.throws(() => silentOptions(state, [...printers, { identity: { ...identity, name: 'Copy' } }]), /ambigua/)
  assert.throws(() => silentOptions(state, [{ identity, status: 'offline (cola Windows)' }]), /fuera de línea/)
  assert.throws(() => silentOptions(state, [{ identity: { ...identity, port: 'USB004' } }]), /no encontrada/)
})
test('old v1 bindings survive; silent is OFF and settings persist across restart', t => {
  const dir = temp(t); const first = new Store(dir); const old = first.read()
  delete old.silentEnabled; delete old.silentProfileId
  old.profiles[0].identity = identity
  fs.writeFileSync(first.file, JSON.stringify(old))
  const next = new Store(dir); const migrated = next.read()
  assert.equal(migrated.silentEnabled, false); assert.equal(migrated.silentProfileId, '')
  assert.deepEqual(migrated.profiles, old.profiles)
  next.write({ ...migrated, enabled: true, silentEnabled: true, silentProfileId: old.profiles[0].id })
  assert.equal(new Store(dir).read().silentEnabled, true)
  assert.throws(() => next.write({ ...migrated, silentEnabled: 'true' }), /inválida/)
})
async function runtime(t, options = {}) {
  const dir = temp(t); const store = new Store(dir); const initial = store.read()
  store.write({ ...initial, enabled: options.beta !== false, silentEnabled: Boolean(options.silent), silentProfileId: initial.profiles[0].id, profiles: initial.profiles.map((p, i) => i ? p : { ...p, identity: options.missing ? null : identity }) })
  const handlers = {}; const windows = []; const printed = []; const requests = []; let inventoryCalls = 0; let open
  class Window {
    constructor() {
      windows.push(this)
      this.webContents = { mainFrame: {}, getPrintersAsync: async () => { inventoryCalls++; return options.printers || [{ name: 'Labels' }] }, setWindowOpenHandler() {}, on() {},
        print: (printOptions, cb) => { printed.push(JSON.parse(JSON.stringify(printOptions))); cb(options.fail !== true, options.fail ? 'mock print failure' : undefined) } }
    }
    on() {} setMenu() {} setMenuBarVisibility() {} isDestroyed() { return false } focus() {} close() { this.closed = true }
    async loadURL(url) { this.webContents.mainFrame.url = url }
    loadFile(file) { this.webContents.mainFrame.url = require('node:url').pathToFileURL(file).href }
  }
  const electron = { app: { getPath: () => dir, whenReady: () => Promise.resolve() }, BrowserWindow: Window, Menu: { buildFromTemplate: items => { open = items[0].submenu[0].click } }, ipcMain: { handle: (name, fn) => { handlers[name] = fn } }, dialog: {} }
  const main = path.resolve(__dirname, '../../main.js')
  vm.runInNewContext(fs.readFileSync(main, 'utf8'), { __dirname: path.dirname(main), require: name => name === 'electron' ? electron : name === './beta-printers' ? require('../index') : require(name), fetch: async (url, config) => { requests.push({ url, config }); return { ok: true, text: async () => '<html><body>labels</body></html>' } } })
  await new Promise(r => setImmediate(r))
  const event = { sender: windows[0].webContents, senderFrame: windows[0].webContents.mainFrame }
  return { handlers, windows, printed, requests, event, open: () => open(), inventoryCalls: () => inventoryCalls, print: payload => handlers['print-labels'](event, payload) }
}
test('actual main handler: unchecked retains selector/options/payload and skips inventory', async t => {
  for (const options of [{ silent: false }, { silent: true, beta: false }]) {
    const h = await runtime(t, options)
    const payload = { print: [{ id: 123 }], order: { id: 1 }, deviceName: 'untrusted' }
    assert.equal((await h.print(payload)).ok, true)
    assert.deepEqual(h.printed[0], { silent: false, printBackground: true, margins: { marginType: 'none' } })
    assert.equal(h.inventoryCalls(), 0)
    assert.equal(h.requests[0].config.body, JSON.stringify(payload))
    assert.equal(h.requests[0].url, 'http://localhost:3031/api/print/labels')
    assert.equal(h.windows[1].closed, true)
  }
})
test('actual main handler: checked prints to saved destination, retains layout; failure never retries', async t => {
  for (const fail of [false, true]) {
    const h = await runtime(t, { silent: true, fail })
    const result = await h.print({ deviceName: 'other', silent: false })
    assert.equal(result.ok, !fail); assert.equal(h.printed.length, 1)
    assert.deepEqual(h.printed[0], { silent: true, deviceName: 'Labels', printBackground: true, margins: { marginType: 'none' } })
    assert.equal(h.inventoryCalls(), 1); assert.equal(h.windows[1].closed, true)
  }
})
test('actual main handler: invalid/missing/ambiguous destination or unauthorized origin never prints', async t => {
  for (const options of [{ missing: true }, { printers: [] }, { printers: [{ name: 'Labels' }, { name: 'Copy' }] }, { untrusted: true }]) {
    const h = await runtime(t, { ...options, silent: true })
    if (options.untrusted) h.event.senderFrame.url = 'https://evil.test'
    const result = await h.print({})
    assert.equal(result.ok, false); assert.equal(h.printed.length, 0); assert.equal(h.windows.length, 1)
    assert.match(result.message, /Impresión sin diálogo|Origen no autorizado/)
  }
})
test('local IPC: toggles persist, invalid activation rejected, beta OFF disarms silent', async t => {
  const h = await runtime(t)
  h.open()
  const settings = h.windows[1]
  const event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame }
  const invoke = (method, value) => h.handlers[`beta-printers:${method}`](event, value)
  const old = (await invoke('getStatus')).data
  assert.equal((await invoke('setSilentSettings', { enabled: 'yes', profileId: old.profiles[0].id })).ok, false)
  assert.equal((await invoke('setSilentSettings', { enabled: true, profileId: '' })).ok, false)
  const enabled = await invoke('setSilentSettings', { enabled: true, profileId: old.profiles[0].id })
  assert.equal(enabled.ok, true); assert.equal(enabled.data.silentEnabled, true)
  assert.equal((await h.print({})).ok, true); assert.equal(h.printed.at(-1).silent, true)
  await invoke('setSilentSettings', { enabled: false, profileId: old.profiles[0].id })
  assert.equal((await h.print({})).ok, true); assert.equal(h.printed.at(-1).silent, false)
  await invoke('setSilentSettings', { enabled: true, profileId: old.profiles[0].id })
  const off = await invoke('setEnabled', false); assert.equal(off.data.silentEnabled, false)
  await invoke('setEnabled', true)
  assert.equal((await invoke('getStatus')).data.silentEnabled, false)
  await assert.rejects(h.handlers['beta-printers:setSilentSettings'](h.event, { enabled: true, profileId: old.profiles[0].id }), /Origen/)
})
