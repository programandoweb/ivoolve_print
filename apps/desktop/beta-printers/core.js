const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const text = (value, max = 256) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f]/.test(value)
const identityKeys = ['name', 'driver', 'port', 'pnp', 'serial']
function validIdentity(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && text(v.name) && v.name.length > 0 &&
    Object.keys(v).every(k => identityKeys.includes(k) && text(v[k], 512))
}
function resolve(identity, printers) {
  if (!identity) return { state: 'not-found', candidates: [] }
  const matches = identity.serial
    ? printers.filter(p => p.identity.serial === identity.serial && p.identity.driver === identity.driver)
    : printers.filter(p => p.identity.driver === identity.driver)
  if (identity.serial && matches.length === 1) return { state: 'verified', candidates: matches }
  if (matches.length > 1) return { state: 'ambiguous', candidates: matches }
  const exact = matches.filter(p => p.identity.name === identity.name && p.identity.port === identity.port && p.identity.pnp === identity.pnp)
  return { state: exact.length === 1 ? 'probable' : 'not-found', candidates: exact }
}
function initial() {
  return { version: 1, station: randomUUID(), enabled: false, updatedAt: new Date().toISOString(), profiles: ['Etiquetas', 'Membretes', 'Despachos'].map(label => ({ id: randomUUID(), label, identity: null })) }
}
function validState(s) {
  return s && s.version === 1 && text(s.station, 64) && typeof s.enabled === 'boolean' && text(s.updatedAt, 64) && Array.isArray(s.profiles) && s.profiles.length <= 100 &&
    s.profiles.every(p => p && text(p.id, 64) && p.id.length && text(p.label, 80) && p.label.trim() && (p.identity === null || validIdentity(p.identity))) &&
    new Set(s.profiles.map(p => p.id)).size === s.profiles.length && new Set(s.profiles.map(p => p.label.trim().toLocaleLowerCase())).size === s.profiles.length
}
class Store {
  constructor(dir) { this.file = path.join(dir, 'beta-printer-profiles.json'); this.state = initial(); this.diagnostic = null; this.loaded = false }
  read() {
    if (this.loaded) return this.state
    this.loaded = true
    try {
      const stat = fs.statSync(this.file)
      if (!stat.isFile() || stat.size > 262144) throw Error('invalid')
      const s = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (!validState(s)) throw Error('invalid')
      this.state = s
    } catch (e) { if (e.code !== 'ENOENT') this.diagnostic = 'Configuración ilegible o incompatible. BETA desactivada; archivo original conservado hasta guardar un cambio explícito.' }
    return this.state
  }
  write(next) {
    if (!validState(next)) throw Error('Configuración inválida')
    const value = { ...next, updatedAt: new Date().toISOString() }
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${randomUUID()}.tmp`
    try {
      const fd = fs.openSync(tmp, 'wx', 0o600)
      try { fs.writeFileSync(fd, JSON.stringify(value, null, 2)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
      fs.renameSync(tmp, this.file)
    } finally { try { fs.unlinkSync(tmp) } catch {} }
    this.state = value; this.diagnostic = null
    return value
  }
}
module.exports = { Store, resolve, validIdentity, text }
