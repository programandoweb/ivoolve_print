'use strict'
// Escritor JSONL asíncrono, con cola acotada, rotación por día/tamaño y retención.
// Garantías: write() NUNCA bloquea ni lanza; si el disco falla se cuenta lo descartado,
// se avisa por stderr (con límite de frecuencia) y la operación crítica sigue.
const fs = require('node:fs')
const path = require('node:path')

const DAY = 24 * 60 * 60 * 1000
const FILE_PATTERN = /^([a-z]+)-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.jsonl$/

function utcDay(ms) { return new Date(ms).toISOString().slice(0, 10) }
function fileName(prefix, day, seq) { return `${prefix}-${day}${seq > 0 ? `.${seq}` : ''}.jsonl` }
function parseFile(name) {
  const m = FILE_PATTERN.exec(name)
  return m ? { prefix: m[1], day: m[2], seq: m[3] ? Number(m[3]) : 0 } : null
}

function stderrNotice(state, text) {
  // Un aviso por minuto como máximo; jamás usa el logger (evita bucles recursivos).
  const now = Date.now()
  if (now - state.last < 60000) return
  state.last = now
  try { process.stderr.write(`[ivoolve-logging] ${text}\n`) } catch { /* nada más que hacer */ }
}

/**
 * Aplica retención sobre `root` (todas sus subcarpetas de escritores):
 * 1) borra archivos más viejos que `retentionDays`; 2) si el total supera `maxTotalBytes`,
 * borra los más antiguos primero. Nunca borra el archivo del día actual de cada carpeta.
 */
async function enforceRetention(root, { retentionDays = 14, maxTotalBytes = 250 * 1024 * 1024, now = Date.now() } = {}) {
  const result = { deleted: 0, freedBytes: 0, errors: 0 }
  const today = utcDay(now)
  const cutoff = utcDay(now - retentionDays * DAY)
  const files = []
  let dirs = []
  try { dirs = (await fs.promises.readdir(root, { withFileTypes: true })).filter(d => d.isDirectory()) } catch { return result }
  for (const dir of dirs) {
    let names = []
    try { names = await fs.promises.readdir(path.join(root, dir.name)) } catch { continue }
    for (const name of names) {
      const info = parseFile(name)
      if (!info) continue
      const full = path.join(root, dir.name, name)
      try { files.push({ full, day: info.day, seq: info.seq, size: (await fs.promises.stat(full)).size }) } catch { result.errors++ }
    }
  }
  const remove = async file => {
    try { await fs.promises.unlink(file.full); result.deleted++; result.freedBytes += file.size; return true } catch { result.errors++; return false }
  }
  let kept = []
  for (const file of files) {
    if (file.day < cutoff && file.day !== today) await remove(file)
    else kept.push(file)
  }
  let total = kept.reduce((sum, f) => sum + f.size, 0)
  if (total > maxTotalBytes) {
    kept = kept.sort((a, b) => (a.day === b.day ? a.seq - b.seq : a.day < b.day ? -1 : 1))
    for (const file of kept) {
      if (total <= maxTotalBytes) break
      if (file.day === today) continue
      if (await remove(file)) total -= file.size
    }
  }
  return result
}

class LogWriter {
  /**
   * @param {object} o
   * @param {string} o.dir directorio del escritor (p. ej. <root>/electron)
   * @param {string} o.prefix prefijo de archivo (p. ej. "electron")
   * @param {() => (string|null)} [o.noticeFactory] línea JSON para avisar descartes
   */
  constructor({ dir, prefix, maxFileBytes = 10 * 1024 * 1024, maxQueue = 2000, maxQueueBytes = 2 * 1024 * 1024, flushMs = 200, noticeFactory = null, now = Date.now } = {}) {
    this.dir = dir; this.prefix = prefix; this.maxFileBytes = maxFileBytes
    this.maxQueue = maxQueue; this.maxQueueBytes = maxQueueBytes; this.flushMs = flushMs
    this.noticeFactory = noticeFactory; this.now = now
    this.queue = []; this.queueBytes = 0; this.dropped = 0; this.written = 0; this.failedBatches = 0
    this.timer = null; this.flushing = null; this.closed = false
    this.current = null // { day, seq, size }
    this.notice = { last: 0 }
    this.dirReady = false
  }

  write(line) {
    try {
      if (this.closed) return false
      const bytes = Buffer.byteLength(line) + 1
      if (this.queue.length >= this.maxQueue || this.queueBytes + bytes > this.maxQueueBytes) { this.dropped++; return false }
      this.queue.push(line); this.queueBytes += bytes
      if (!this.timer) { this.timer = setTimeout(() => { this.timer = null; this.flush().catch(() => {}) }, this.flushMs); this.timer.unref?.() }
      return true
    } catch { this.dropped++; return false }
  }

  _takeBatch() {
    const lines = this.queue; this.queue = []; this.queueBytes = 0
    if (this.dropped > 0 && this.noticeFactory) {
      let extra = null
      try { extra = this.noticeFactory(this.dropped) } catch { /* sin aviso */ }
      if (extra) { lines.push(extra); this.dropped = 0 }
    }
    return lines
  }

  async _ensureTarget(extraBytes, day) {
    if (!this.dirReady) { await fs.promises.mkdir(this.dir, { recursive: true }); this.dirReady = true }
    if (!this.current || this.current.day !== day) {
      // Reanuda el último archivo del día (el proceso puede haberse reiniciado).
      let seq = 0
      try {
        for (const name of await fs.promises.readdir(this.dir)) {
          const info = parseFile(name)
          if (info && info.prefix === this.prefix && info.day === day && info.seq > seq) seq = info.seq
        }
      } catch { /* directorio nuevo */ }
      let size = 0
      try { size = (await fs.promises.stat(path.join(this.dir, fileName(this.prefix, day, seq)))).size } catch { /* archivo nuevo */ }
      this.current = { day, seq, size }
    }
    if (this.current.size > 0 && this.current.size + extraBytes > this.maxFileBytes) {
      this.current = { day, seq: this.current.seq + 1, size: 0 }
    }
    return path.join(this.dir, fileName(this.prefix, this.current.day, this.current.seq))
  }

  async _flushOnce() {
    const lines = this._takeBatch()
    if (!lines.length) return false // nada que escribir: corta el bucle de flush()
    const payload = lines.join('\n') + '\n'
    const bytes = Buffer.byteLength(payload)
    try {
      const target = await this._ensureTarget(bytes, utcDay(this.now()))
      await fs.promises.appendFile(target, payload, 'utf8')
      this.current.size += bytes; this.written += lines.length
      return true
    } catch (error) {
      this.failedBatches++; this.dropped += lines.length
      this.dirReady = false; this.current = null
      stderrNotice(this.notice, `No se pudo escribir ${this.prefix}: ${String(error?.code || error?.message || error).slice(0, 120)} (${this.dropped} eventos pendientes de aviso)`)
      return false
    }
  }

  // Vacía la cola completa (incluye lo que llegue durante la escritura). Un fallo corta el bucle.
  flush() {
    if (this.flushing) return this.flushing
    if (!this.queue.length && !(this.dropped && this.noticeFactory)) return Promise.resolve()
    this.flushing = (async () => {
      while (this.queue.length || (this.dropped && this.noticeFactory)) {
        if (!(await this._flushOnce())) break
      }
    })().finally(() => { this.flushing = null })
    return this.flushing
  }

  // Escritura síncrona de último recurso (cierre del proceso / fallo fatal).
  flushSync() {
    try {
      if (this.timer) { clearTimeout(this.timer); this.timer = null }
      const lines = this._takeBatch()
      if (!lines.length) return
      const payload = lines.join('\n') + '\n'
      fs.mkdirSync(this.dir, { recursive: true })
      const day = utcDay(this.now())
      let seq = 0; let size = 0
      if (this.current?.day === day) ({ seq, size } = this.current)
      else for (const name of fs.readdirSync(this.dir)) { const i = parseFile(name); if (i && i.prefix === this.prefix && i.day === day && i.seq > seq) seq = i.seq }
      const file = path.join(this.dir, fileName(this.prefix, day, seq))
      try { size = fs.statSync(file).size } catch { size = 0 }
      if (size > 0 && size + Buffer.byteLength(payload) > this.maxFileBytes) seq++
      fs.appendFileSync(path.join(this.dir, fileName(this.prefix, day, seq)), payload, 'utf8')
      this.current = null; this.written += lines.length
    } catch (error) {
      stderrNotice(this.notice, `flushSync falló: ${String(error?.code || error?.message || error).slice(0, 120)}`)
    }
  }

  async close() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    try { await this.flush() } catch { /* sin acción */ }
    this.closed = true
  }

  stats() {
    return { queued: this.queue.length, dropped: this.dropped, written: this.written, failedBatches: this.failedBatches }
  }
}

module.exports = { LogWriter, enforceRetention, parseFile, fileName, utcDay, FILE_PATTERN }
