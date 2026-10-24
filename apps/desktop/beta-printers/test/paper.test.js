const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { defaults, validPaper, paperOptions, paperCss, calibrationHtml } = require('../paper')
const { Store } = require('../core')
test('paper defaults match current stock; driver/default path preserves layout, custom uses microns', () => {
  const p = defaults()
  assert.equal(p.widthMm, 101.6); assert.equal(p.heightMm, 101.6)
  assert.equal(p.exposedLeftMm, 1.3); assert.equal(p.exposedRightMm, 1.3)
  assert.equal(p.orientation, 'portrait'); assert.equal(p.leftMm, 0)
  assert.deepEqual(paperOptions(p), {}); assert.equal(paperCss(p), '')
  assert.deepEqual(paperOptions(p, true), { usePrinterDefaultPageSize: true })
  const custom = { ...p, source: 'custom', orientation: 'landscape', leftMm: 2.54 }
  const options = paperOptions(custom)
  assert.deepEqual(options.pageSize, { width: 101600, height: 101600 })
  assert.equal(options.landscape, true); assert.equal(options.margins.left, 9.6)
  assert.equal(options.scaleFactor, 100); assert.equal('usePrinterDefaultPageSize' in options, false)
  assert.match(paperCss(custom), /size: 101.6mm 101.6mm/)
  assert.match(paperCss({ ...p, offsetXMm: -2, offsetYMm: 1 }), /left: -2mm/)
})
test('paper inputs reject invalid values and arbitrary CSS; labels are escaped in calibration', () => {
  const p = defaults()
  for (const invalid of [{ ...p, widthMm: NaN }, { ...p, heightMm: Infinity }, { ...p, widthMm: 0 }, { ...p, offsetXMm: 21 }, { ...p, leftMm: 100, rightMm: 10 }, { ...p, orientation: 'url(test)' }, { ...p, source: 'remote' }, { ...p, offsetYMm: '1; color:red' }, { ...p, command: 'x' }]) {
    assert.equal(Boolean(validPaper(invalid)), false); assert.throws(() => paperOptions(invalid), /Papel:/)
  }
  const html = calibrationHtml(p, '<script>alert(1)</script>')
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;'))
  assert.match(html, /20 × 20 mm/); assert.match(html, /Papel según Windows/)
})
test('paper migration is additive; each profile persists its own measures across restart', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-profile-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const store = new Store(dir); const old = store.read()
  old.profiles.forEach(p => { delete p.paper }); fs.writeFileSync(store.file, JSON.stringify(old))
  const next = new Store(dir); const migrated = next.read()
  assert.deepEqual(migrated.profiles[0].paper, defaults())
  const changed = { ...defaults(), source: 'custom', widthMm: 80, heightMm: 100, offsetYMm: 2 }
  next.write({ ...migrated, profiles: migrated.profiles.map((p, i) => i ? p : { ...p, paper: changed }) })
  const reloaded = new Store(dir).read()
  assert.deepEqual(reloaded.profiles[0].paper, changed); assert.deepEqual(reloaded.profiles[1].paper, defaults('Membretes'))
  assert.equal(reloaded.profiles[0].id, old.profiles[0].id)
})
test('Membretes: exact 101×24 mm Vertical, 1 mm exposed, no inferred side swapping', () => {
  const paper = defaults('Membretes')
  assert.equal(paper.widthMm, 101); assert.equal(paper.heightMm, 24)
  assert.equal(paper.orientation, 'portrait'); assert.equal(paper.source, 'driver')
  assert.equal(paper.exposedLeftMm, 1); assert.equal(paper.exposedRightMm, 1)
  const custom = { ...paper, source: 'custom' }
  assert.deepEqual(paperOptions(custom).pageSize, { width: 101000, height: 24000 })
  assert.equal(paperOptions(custom).landscape, false)
  assert.match(paperCss(custom), /size: 101mm 24mm/)
  assert.equal(paperOptions(custom).margins.left, 0)
  assert.equal(defaults('Etiquetas').widthMm, 101.6); assert.equal(defaults('Etiquetas').exposedLeftMm, 1.3)
})
test('existing Membretes generic defaults migrate; user paper and other profiles remain intact', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'membretes-default-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const first = new Store(dir); const previous = first.read()
  const idx = previous.profiles.findIndex(p => p.label === 'Membretes')
  previous.profiles[idx].paper = defaults(); delete previous.profiles[idx].paperCustomized
  previous.profiles[idx].identity = { name: 'Membretes 2026', driver: 'Thermal', port: 'USB004', pnp: '', serial: '' }
  previous.profiles[idx].silentEnabled = true
  fs.writeFileSync(first.file, JSON.stringify(previous))
  const migrated = new Store(dir).read()
  assert.deepEqual(migrated.profiles[idx].paper, defaults('Membretes'))
  assert.deepEqual(migrated.profiles[idx].identity, previous.profiles[idx].identity)
  assert.equal(migrated.profiles[idx].silentEnabled, true)
  assert.deepEqual(migrated.profiles[0], previous.profiles[0])
  for (const [paper, explicit] of [[{ ...defaults(), widthMm: 80, heightMm: 40 }, false], [defaults(), true]]) {
    const settings = { ...previous, profiles: previous.profiles.map((p, i) => i === idx ? { ...p, paper, paperCustomized: explicit } : p) }
    fs.writeFileSync(first.file, JSON.stringify(settings))
    assert.deepEqual(new Store(dir).read().profiles[idx].paper, paper)
  }
})
