const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const { Store } = require('../core')
const { silentOptions } = require('../silent')
const identity = { name: 'Labels', driver: '', port: '', pnp: '', serial: '' }
const state = { enabled: true, labelsProfileId: 'label', profiles: [{ id: 'label', label: 'Etiquetas', identity, enabled: true, silentEnabled: true, silentQueueConfirmation: null }] }
const temp = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silent-printers-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir }

test('silent choice: OFF unchanged; selected profile only; missing/ambiguous/offline rejected', () => {
  const printers = [{ identity, status: 'desconocido' }]
  assert.deepEqual(silentOptions({ ...state, profiles: [{ ...state.profiles[0], silentEnabled: false }] }, []), {})
  assert.deepEqual(silentOptions({ ...state, enabled: false }, []), {})
  assert.deepEqual(silentOptions(state, printers), { silent: true, deviceName: 'Labels' })
  assert.throws(() => silentOptions({ ...state, labelsProfileId: 'missing' }, printers), /Perfil de impresión no encontrado/)
  assert.throws(() => silentOptions(state, []), /no encontrada o ambigua/)
  assert.throws(() => silentOptions(state, [...printers, { identity: { ...identity, name: 'Copy' } }]), /ambigua/)
  assert.throws(() => silentOptions(state, [{ identity, status: 'offline (cola Windows)' }]), /fuera de línea/)
  assert.throws(() => silentOptions(state, [{ identity: { ...identity, port: 'USB004' } }]), /no encontrada/)
})
test('old v1 bindings and enabled silent authorization migrate to their own profile', t => {
  const dir = temp(t); const first = new Store(dir)
  for (const silentEnabled of [false, true]) {
    const old = { version: 1, station: 'station', enabled: true, updatedAt: new Date().toISOString(), silentEnabled, silentProfileId: 'custom', silentQueueConfirmation: identity, profiles: [{ id: 'label', label: 'Etiquetas', identity: null }, { id: 'custom', label: 'Personalizado', identity }] }
    fs.writeFileSync(first.file, JSON.stringify(old))
    const next = new Store(dir); const migrated = next.read()
    assert.equal(migrated.labelsProfileId, 'custom')
    assert.equal(migrated.profiles[1].silentEnabled, silentEnabled)
    assert.equal(migrated.profiles[0].silentEnabled, false)
    assert.deepEqual(migrated.profiles[1].identity, identity)
    assert.equal(migrated.profiles[1].enabled, true)
    next.write(migrated)
    assert.deepEqual(new Store(dir).read(), next.state)
    assert.equal('silentEnabled' in migrated, false)
    assert.throws(() => next.write({ ...migrated, profiles: [{ ...migrated.profiles[0], enabled: 'yes' }] }), /inválida/)
  }
})
async function runtime(t, options = {}) {
  const dir = temp(t); const store = new Store(dir); const initial = store.read()
  store.write({ ...initial, enabled: options.beta !== false, profiles: initial.profiles.map((p, i) => i ? p : { ...p, paper: options.paper ?? p.paper, identity: options.missing ? null : identity, enabled: options.active !== false, silentEnabled: Boolean(options.silent) }) })
  const handlers = {}; const windows = []; const printed = []; const requests = []; const styles = []; let inventoryCalls = 0; let open; let profileController
  class Window {
    constructor() {
      windows.push(this)
      this.webContents = { mainFrame: {}, getPrintersAsync: async () => { inventoryCalls++; return options.printers || [{ name: 'Labels' }] }, setWindowOpenHandler() {}, on() {},
        insertCSS: async css => { if (options.failCss) throw Error('CSS failure'); styles.push(css) }, print: (printOptions, cb) => { printed.push(JSON.parse(JSON.stringify(printOptions))); cb(options.fail !== true, options.fail ? 'mock print failure' : undefined) } }
    }
    on() {} setMenu() {} setMenuBarVisibility() {} isDestroyed() { return false } focus() {} close() { this.closed = true }
    async loadURL(url) { this.lastUrl = url; this.webContents.mainFrame.url = url }
    loadFile(file) { this.webContents.mainFrame.url = require('node:url').pathToFileURL(file).href }
  }
  const electron = { app: { getPath: () => dir, whenReady: () => Promise.resolve() }, BrowserWindow: Window, Menu: { buildFromTemplate: items => { open = items[0].submenu[0].click } }, ipcMain: { handle: (name, fn) => { handlers[name] = fn } }, dialog: { showMessageBox: async () => ({ response: options.calibrationResponse ?? 0 }) } }
  const main = path.resolve(__dirname, '../../main.js')
  vm.runInNewContext(fs.readFileSync(main, 'utf8'), { __dirname: path.dirname(main), require: name => name === 'electron' ? electron : name === './beta-printers' ? require('../index') : name === './prisma-agent' ? { register: () => () => {} } : name === './dispatch-print' ? { registerScheme() {}, register: options => { profileController = options.profiles; return () => {} } } : require(name), fetch: async (url, config) => { requests.push({ url, config }); return { ok: true, text: async () => '<html><body>labels</body></html>' } } })
  await new Promise(r => setImmediate(r))
  const event = { sender: windows[0].webContents, senderFrame: windows[0].webContents.mainFrame }
  return { handlers, windows, printed, requests, styles, event, profileController, open: () => open(), inventoryCalls: () => inventoryCalls, print: payload => handlers['print-labels'](event, payload) }
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
    assert.deepEqual(h.printed[0], { silent: true, usePrinterDefaultPageSize: true, deviceName: 'Labels', printBackground: true, margins: { marginType: 'none' } })
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
  assert.equal((await invoke('setProfileSettings', { enabled: 'yes', silentEnabled: true, id: old.profiles[0].id })).ok, false)
  assert.equal((await invoke('setProfileSettings', { enabled: true, silentEnabled: true, id: '' })).ok, false)
  const enabled = await invoke('setProfileSettings', { enabled: true, silentEnabled: true, id: old.profiles[0].id })
  assert.equal(enabled.ok, true); assert.equal(enabled.data.profiles[0].silentEnabled, true)
  assert.equal((await h.print({})).ok, true); assert.equal(h.printed.at(-1).silent, true)
  await invoke('setProfileSettings', { enabled: true, silentEnabled: false, id: old.profiles[0].id })
  assert.equal((await h.print({})).ok, true); assert.equal(h.printed.at(-1).silent, false)
  await invoke('setProfileSettings', { enabled: true, silentEnabled: true, id: old.profiles[0].id })
  const off = await invoke('setEnabled', false); assert.equal(off.data.profiles[0].silentEnabled, false)
  await invoke('setEnabled', true)
  assert.equal((await invoke('getStatus')).data.profiles[0].silentEnabled, false)
  await assert.rejects(h.handlers['beta-printers:setProfileSettings'](h.event, { enabled: true, silentEnabled: true, id: old.profiles[0].id }), /Origen/)
})

test('identical models: explicit queue confirmation, immutable binding, no inferred physical serial', () => {
  const a = { ...identity, driver: 'ZD220', port: 'USB003', pnp: 'INSTANCE-ONE' }
  const b = { ...a, name: 'Labels Copy 1', port: 'USB004', pnp: 'INSTANCE-TWO' }
  const printers = [{ identity: a }, { identity: b }]
  const configured = { ...state, profiles: [{ ...state.profiles[0], identity: a }] }
  assert.throws(() => silentOptions(configured, printers), error => error.code === 'QUEUE_CONFIRMATION_REQUIRED')
  const approved = { ...configured, profiles: [{ ...configured.profiles[0], silentQueueConfirmation: a }] }
  assert.deepEqual(silentOptions(approved, printers), { silent: true, deviceName: a.name })
  for (const key of ['name', 'driver', 'port', 'pnp']) {
    assert.throws(() => silentOptions(approved, [{ identity: { ...a, [key]: 'CHANGED' } }, { identity: b }]))
  }
  assert.throws(() => silentOptions(approved, [{ identity: a }, { identity: a }]), /ambigua/)
  assert.throws(() => silentOptions(approved, [{ identity: a }, { identity: { ...b, name: a.name } }]), /ambigua/)
  assert.throws(() => silentOptions({ ...approved, profiles: [{ ...approved.profiles[0], silentQueueConfirmation: b }] }, printers), error => error.code === 'QUEUE_CONFIRMATION_REQUIRED')
  assert.throws(() => silentOptions(approved, [{ identity: a, status: 'offline (CIM)' }, { identity: b }]), /fuera de línea/)
})

test('manual queue IPC: native cancel, accept, revalidation, persistence, disarm and rebind', async t => {
  const dir = temp(t); const store = new Store(dir); const initial = store.read()
  const a = { ...identity, driver: 'ZD220', port: 'USB003', pnp: 'INSTANCE-ONE' }
  const b = { ...a, name: 'Labels Copy 1', port: 'USB004', pnp: 'INSTANCE-TWO' }
  let rows = [{ identity: a }, { identity: b }]; let response = 0; let confirmations = 0; let opened; let launch
  store.write({ ...initial, enabled: true, profiles: initial.profiles.map((p, i) => i ? p : { ...p, identity: a }) })
  const handlers = {}
  class Window {
    constructor() { opened = this; this.webContents = { mainFrame: {}, setWindowOpenHandler() {}, on() {} } }
    on() {} loadFile(file) { this.webContents.mainFrame.url = require('node:url').pathToFileURL(file).href } isDestroyed() { return false } focus() {}
  }
  const entry = path.resolve(__dirname, '../index.js'); const exports = { exports: {} }; const nativeRequire = require('node:module').createRequire(entry)
  vm.runInNewContext(fs.readFileSync(entry, 'utf8'), { __dirname: path.dirname(entry), module: exports, URL, require: name => name === './inventory' ? { inventory: async () => ({ printers: rows }) } : nativeRequire(name) })
  const attach = exports.exports.register({ app: { getPath: () => dir }, BrowserWindow: Window, Menu: { buildFromTemplate: items => { launch = items[0].submenu[0].click } }, ipcMain: { handle: (name, fn) => { handlers[name] = fn } }, dialog: { showMessageBox: async (_, options) => { confirmations++; assert.match(options.detail, /USB00[34]/); assert.match(options.detail, /no un equipo físico/); return { response } } } })
  const shell = { webContents: { mainFrame: { url: 'https://ivoolve-print-frontend.vercel.app/dashboard' } }, setMenu() {}, setMenuBarVisibility() {} }; attach(shell); launch()
  const localEvent = { sender: opened.webContents, senderFrame: opened.webContents.mainFrame }
  const shellEvent = { sender: shell.webContents, senderFrame: shell.webContents.mainFrame }
  const invoke = (method, value) => handlers[`beta-printers:${method}`](localEvent, value)
  const config = { enabled: true, silentEnabled: true, id: initial.profiles[0].id }
  const cancelled = await invoke('setProfileSettings', config)
  assert.equal(cancelled.data.profiles[0].silentEnabled, false); assert.equal(confirmations, 1)
  response = 1
  const accepted = await invoke('setProfileSettings', config)
  assert.equal(accepted.ok, true); assert.equal(accepted.data.profiles[0].silentEnabled, true); assert.equal(confirmations, 2)
  assert.equal(new Store(dir).read().profiles[0].silentQueueConfirmation.port, 'USB003')
  assert.equal((await attach.getPrintOptions(shellEvent)).deviceName, a.name); assert.equal(confirmations, 2)
  rows = [{ identity: { ...a, port: 'USB009' } }, { identity: b }]
  await assert.rejects(attach.getPrintOptions(shellEvent), /no encontrada o ambigua/)
  rows = [{ identity: a }, { identity: b }]
  await invoke('saveProfile', { id: initial.profiles[0].id, label: 'Etiquetas', identity: b })
  assert.equal((await invoke('getStatus')).data.profiles.find(p => p.id === config.id).silentEnabled, false)
  assert.equal((await invoke('setProfileSettings', config)).ok, true)
  assert.equal(confirmations, 3)
  const disabled = await invoke('setEnabled', false)
  assert.equal(disabled.data.profiles[0].silentQueueConfirmation, null); assert.equal(disabled.data.profiles[0].silentEnabled, false)
})

test('per-profile settings are independent; disabled destination blocks both silent and dialog jobs', async t => {
  const h = await runtime(t)
  h.open()
  const event = { sender: h.windows[1].webContents, senderFrame: h.windows[1].webContents.mainFrame }
  const invoke = (method, value) => h.handlers[`beta-printers:${method}`](event, value)
  let settings = (await invoke('getStatus')).data
  const a = settings.profiles[0].id; const b = settings.profiles[1].id
  await invoke('saveProfile', { id: b, label: 'Membretes', identity })
  assert.equal((await invoke('setProfileSettings', { id: b, enabled: true, silentEnabled: true })).ok, true)
  settings = (await invoke('getStatus')).data
  assert.equal(settings.profiles.find(p => p.id === b).silentEnabled, true)
  assert.equal(settings.profiles.find(p => p.id === a).silentEnabled, false)
  assert.equal((await h.print({})).ok, true); assert.equal(h.printed.at(-1).silent, false)
  const renamed = await invoke('saveProfile', { id: b, label: 'Papel membrete', identity })
  assert.equal(renamed.data.profiles.find(p => p.id === b).silentEnabled, true)
  assert.equal((await invoke('setLabelsProfile', b)).ok, true)
  assert.equal((await h.print({})).ok, true); assert.equal(h.printed.at(-1).silent, true)
  const off = await invoke('setProfileSettings', { id: b, enabled: false, silentEnabled: true })
  assert.equal(off.data.profiles.find(p => p.id === b).enabled, false)
  assert.deepEqual(off.data.profiles.find(p => p.id === b).identity, identity)
  assert.equal(off.data.profiles.find(p => p.id === b).silentEnabled, false)
  const count = h.printed.length; const calls = h.inventoryCalls()
  const blocked = await h.print({}); assert.equal(blocked.ok, false); assert.match(blocked.message, /desactivado/)
  assert.equal(h.printed.length, count); assert.equal(h.inventoryCalls(), calls)
  assert.equal((await invoke('setLabelsProfile', b)).ok, false)
  assert.equal((await invoke('setLabelsProfile', a)).ok, true)
  assert.equal((await h.print({})).ok, true); assert.equal(h.printed.at(-1).silent, false)
  assert.equal((await invoke('setProfileSettings', { id: b, enabled: true, silentEnabled: false })).ok, true)
  assert.equal((await invoke('getStatus')).data.profiles.find(p => p.id === b).silentEnabled, false)
  await invoke('removeProfile', a)
  const removed = await h.print({}); assert.equal(removed.ok, false); assert.match(removed.message, /no encontrado/)
})

test('routing by ID preserves profile-specific dialog/silent/disabled modes', () => {
  const profiles = [
    { id: 'a', enabled: true, silentEnabled: true, identity: { ...identity, driver: 'A' } },
    { id: 'b', enabled: true, silentEnabled: false, identity: { ...identity, name: 'Other', driver: 'B' } },
    { id: 'c', enabled: false, silentEnabled: false, identity: null },
  ]
  const configured = { enabled: true, labelsProfileId: 'a', profiles }
  const printers = profiles.filter(p => p.identity).map(p => ({ identity: p.identity }))
  assert.equal(silentOptions(configured, printers).deviceName, 'Labels')
  assert.deepEqual(silentOptions(configured, printers, 'b'), {})
  assert.throws(() => silentOptions(configured, printers, 'c'), /desactivado/)
})

test('main handler: custom paper/calibration applied without changing API HTML or label contents', async t => {
  const paper = { ...require('../paper').defaults(), source: 'custom', leftMm: 2.54, offsetXMm: 1.5 }
  for (const silent of [true, false]) {
    const h = await runtime(t, { silent, paper })
    assert.equal((await h.print({ order: 1 })).ok, true)
    const output = h.printed[0]
    assert.equal(output.silent, silent); assert.deepEqual(output.pageSize, { width: 101600, height: 101600 })
    assert.equal(output.margins.left, 9.6); assert.equal(h.styles.length, 1)
    assert.match(h.styles[0], /left: 1.5mm/)
    assert.equal(h.requests[0].config.body, JSON.stringify({ order: 1 }))
    if (!silent) assert.equal(h.inventoryCalls(), 0)
  }
  const failed = await runtime(t, { silent: true, paper, failCss: true })
  assert.equal((await failed.print({})).ok, false); assert.equal(failed.printed.length, 0); assert.equal(failed.windows[1].closed, true)
  const off = await runtime(t, { beta: false, silent: true, paper })
  assert.equal((await off.print({})).ok, true); assert.equal(off.styles.length, 0); assert.equal(off.printed[0].silent, false)
})

test('paper IPC: validates local origin, preserves modes/identity on save and isolates other profiles', async t => {
  const h = await runtime(t, { silent: true }); h.open()
  const event = { sender: h.windows[1].webContents, senderFrame: h.windows[1].webContents.mainFrame }
  const invoke = (method, value) => h.handlers[`beta-printers:${method}`](event, value)
  const before = (await invoke('getStatus')).data; const id = before.profiles[0].id
  const paper = { ...require('../paper').defaults(), source: 'custom', heightMm: 152.4 }
  assert.equal((await invoke('savePaper', { id, paper: { ...paper, widthMm: -1 } })).ok, false)
  const saved = await invoke('savePaper', { id, paper }); assert.equal(saved.ok, true)
  assert.deepEqual(saved.data.profiles[0].paper, paper)
  assert.equal(saved.data.profiles[0].silentEnabled, true); assert.deepEqual(saved.data.profiles[0].identity, identity)
  assert.deepEqual(saved.data.profiles[1], before.profiles[1])
  const renamed = await invoke('saveProfile', { id, label: 'Mi perfil', identity })
  assert.deepEqual(renamed.data.profiles.find(p => p.id === id).paper, paper)
  await assert.rejects(h.handlers['beta-printers:savePaper'](h.event, { id, paper }), /Origen/)
  assert.equal((await invoke('calibrateProfile', { id, confirmed: false })).ok, false)
})

test('calibration: native confirmation, one non-silent page to saved device, modes unchanged', async t => {
  const paper = { ...require('../paper').defaults(), source: 'custom', widthMm: 80, heightMm: 100 }
  for (const response of [0, 1]) {
    const h = await runtime(t, { silent: true, paper, calibrationResponse: response }); h.open()
    const event = { sender: h.windows[1].webContents, senderFrame: h.windows[1].webContents.mainFrame }
    const status = () => h.handlers['beta-printers:getStatus'](event)
    const before = (await status()).data
    const result = await h.handlers['beta-printers:calibrateProfile'](event, { id: before.profiles[0].id, confirmed: true })
    assert.equal(result.ok, true)
    if (!response) { assert.equal(result.data.cancelled, true); assert.equal(h.printed.length, 0) }
    else {
      assert.equal(result.data.success, true); assert.equal(h.printed.length, 1)
      assert.equal(h.printed[0].silent, false); assert.equal(h.printed[0].deviceName, 'Labels'); assert.equal(h.printed[0].copies, 1)
      assert.deepEqual(h.printed[0].pageRanges, [{ from: 0, to: 0 }]); assert.deepEqual(h.printed[0].pageSize, { width: 80000, height: 100000 })
      assert.match(decodeURIComponent(h.windows[2].lastUrl), /20 × 20 mm/); assert.equal(h.windows[2].closed, true)
    }
    assert.deepEqual((await status()).data, before)
  }
})

test('letterhead plan uses independent Membretes destination, modes and 101x24 stock', async t => {
  const h = await runtime(t); h.open()
  const event = { sender: h.windows[1].webContents, senderFrame: h.windows[1].webContents.mainFrame }
  const invoke = (method, value) => h.handlers[`beta-printers:${method}`](event, value)
  const before = (await invoke('getStatus')).data
  const id = before.profiles.find(p => p.label === 'Membretes').id
  assert.equal(before.letterheadProfileId, id)
  await invoke('saveProfile', { id, label: 'Membretes', identity })
  await invoke('setProfileSettings', { id, enabled: true, silentEnabled: true })
  const plan = await h.profileController.getPrintPlan(h.event, 'letterhead')
  assert.equal(plan.options.deviceName, 'Labels'); assert.equal(plan.options.silent, true)
  assert.equal(plan.paper.widthMm, 101); assert.equal(plan.paper.heightMm, 24)
  assert.equal((await h.profileController.getPrintPlan(h.event)).options.silent, undefined)
  await invoke('setProfileSettings', { id, enabled: false, silentEnabled: false })
  await assert.rejects(h.profileController.getPrintPlan(h.event, 'letterhead'), /desactivado/)
  await assert.rejects(h.handlers['beta-printers:setLetterheadProfile'](h.event, id), /Origen/)
})
