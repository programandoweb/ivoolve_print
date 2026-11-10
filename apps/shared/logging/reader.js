'use strict'
// Lectura acotada de los logs locales para la interfaz. Solo recibe filtros validados:
// el cliente jamás aporta rutas. Lee línea a línea (streaming) y conserva solo la página pedida.
const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const { LEVELS, LEVEL_RANK, CATEGORIES, COMPONENTS, WRITERS } = require('./catalog')
const { sanitizeEvent, cleanString } = require('./sanitize')
const { FILE_PATTERN } = require('./writer')

const DAY = 24 * 60 * 60 * 1000
const LIMITS = Object.freeze({ maxPageSize: 100, maxWindow: 5000, maxExport: 10000, maxScanLines: 500000, maxScanMs: 8000, maxSearch: 100 })

function toMs(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const ms = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(ms) ? ms : fallback
}
function pick(list, allowed) {
  if (!Array.isArray(list)) return null
  const out = list.filter(item => allowed.includes(item))
  return out.length ? [...new Set(out)] : null
}

function normalizeQuery(raw = {}, { exporting = false } = {}) {
  const q = raw && typeof raw === 'object' ? raw : {}
  const nowMs = Date.now()
  let to = toMs(q.to, nowMs)
  let from = toMs(q.from, to - DAY)
  if (from > to) [from, to] = [to, from]
  const pageSize = exporting ? LIMITS.maxExport : Math.min(Math.max(Math.trunc(Number(q.pageSize)) || 50, 1), LIMITS.maxPageSize)
  let page = Math.max(Math.trunc(Number(q.page)) || 1, 1)
  if (!exporting && page * pageSize > LIMITS.maxWindow) page = Math.max(1, Math.floor(LIMITS.maxWindow / pageSize))
  const search = typeof q.search === 'string' ? q.search.trim().slice(0, LIMITS.maxSearch).toLowerCase() : ''
  return {
    from, to, page, pageSize, search,
    levels: pick(q.levels, LEVELS), categories: pick(q.categories, CATEGORIES), components: pick(q.components, COMPONENTS),
  }
}

async function listFiles(root, query) {
  const fromDay = new Date(query.from).toISOString().slice(0, 10)
  const toDay = new Date(query.to).toISOString().slice(0, 10)
  const files = []
  for (const writer of WRITERS) {
    const dir = path.join(root, writer)
    let names = []
    try { names = await fs.promises.readdir(dir) } catch { continue }
    for (const name of names) {
      const m = FILE_PATTERN.exec(name)
      if (!m || m[1] !== writer || m[2] < fromDay || m[2] > toDay) continue
      files.push({ full: path.join(dir, name), day: m[2], seq: m[3] ? Number(m[3]) : 0 })
    }
  }
  // Más recientes primero: si se alcanza el límite de escaneo, se pierde lo más antiguo.
  return files.sort((a, b) => (a.day === b.day ? b.seq - a.seq : a.day < b.day ? 1 : -1))
}

function matches(event, query, fromMs, toMs_) {
  const t = Date.parse(event.timestamp)
  if (t < fromMs || t > toMs_) return false
  if (query.levels && !query.levels.includes(event.level)) return false
  if (query.categories && !query.categories.includes(event.category)) return false
  if (query.components && !query.components.includes(event.component)) return false
  if (query.search) {
    const haystack = `${event.event} ${event.message} ${event.component || ''} ${event.correlation_id || ''} ${event.error?.name || ''} ${event.error?.code || ''} ${event.error?.message || ''} ${event.metadata ? JSON.stringify(event.metadata) : ''}`.toLowerCase()
    if (!haystack.includes(query.search)) return false
  }
  return true
}

/** Devuelve los eventos más recientes que cumplen el filtro, paginados. */
async function queryLogs(root, rawQuery, options = {}) {
  const query = normalizeQuery(rawQuery, options)
  const offset = (query.page - 1) * query.pageSize
  const keep = offset + query.pageSize + 1
  const files = await listFiles(root, query)
  const deadline = Date.now() + LIMITS.maxScanMs
  let buffer = []; let total = 0; let scanned = 0; let corrupt = 0; let truncated = false; let filesScanned = 0
  const byTime = (a, b) => (a._t === b._t ? b._i - a._i : b._t - a._t)
  let counter = 0

  outer: for (const file of files) {
    filesScanned++
    const stream = fs.createReadStream(file.full, { encoding: 'utf8' })
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity })
    try {
      for await (const line of lines) {
        if (++scanned > LIMITS.maxScanLines || (scanned % 2000 === 0 && Date.now() > deadline)) { truncated = true; lines.close(); stream.destroy(); break outer }
        if (!line) continue
        let parsed
        try { parsed = JSON.parse(line) } catch { corrupt++; continue }
        const event = sanitizeEvent(parsed)
        if (!event) { corrupt++; continue }
        if (!matches(event, query, query.from, query.to)) continue
        total++
        buffer.push(Object.assign(event, {}))
        Object.defineProperty(event, '_t', { value: Date.parse(event.timestamp), enumerable: false })
        Object.defineProperty(event, '_i', { value: counter++, enumerable: false })
        if (buffer.length > keep * 2) buffer = buffer.sort(byTime).slice(0, keep)
      }
    } catch { corrupt++ } finally { lines.close(); stream.destroy() }
  }
  buffer.sort(byTime)
  const items = buffer.slice(offset, offset + query.pageSize)
  return {
    items, page: query.page, pageSize: query.pageSize, total, hasMore: total > offset + query.pageSize,
    truncated, corrupt, filesScanned, scanned,
  }
}

function csvCell(value) {
  let text = value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}` // evita inyección de fórmulas al abrir en Excel
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const CSV_COLUMNS = ['timestamp', 'level', 'category', 'component', 'process', 'event', 'message', 'correlation_id', 'station_id', 'duration_ms', 'error_name', 'error_code', 'error_message', 'metadata']

/** Serializa eventos YA saneados (orden cronológico ascendente) a JSONL o CSV. */
function serialize(events, format) {
  const ordered = [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  if (format === 'csv') {
    const rows = ordered.map(e => [e.timestamp, e.level, e.category, e.component, e.process, e.event, e.message, e.correlation_id, e.station_id, e.duration_ms, e.error?.name, e.error?.code, e.error?.message, e.metadata].map(csvCell).join(','))
    return '﻿' + [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n'
  }
  return ordered.map(e => JSON.stringify(e)).join('\n') + (ordered.length ? '\n' : '')
}

/** Estado de los archivos de log (sin exponer rutas). */
async function infoLogs(root) {
  const out = { files: 0, bytes: 0, oldest: null, newest: null, writers: {} }
  for (const writer of WRITERS) {
    const dir = path.join(root, writer)
    const entry = { files: 0, bytes: 0 }
    let names = []
    try { names = await fs.promises.readdir(dir) } catch { out.writers[writer] = entry; continue }
    for (const name of names) {
      const m = FILE_PATTERN.exec(name)
      if (!m) continue
      try { entry.bytes += (await fs.promises.stat(path.join(dir, name))).size } catch { continue }
      entry.files++
      if (!out.oldest || m[2] < out.oldest) out.oldest = m[2]
      if (!out.newest || m[2] > out.newest) out.newest = m[2]
    }
    out.writers[writer] = entry; out.files += entry.files; out.bytes += entry.bytes
  }
  return out
}

module.exports = { queryLogs, normalizeQuery, serialize, infoLogs, csvCell, LIMITS, cleanString, LEVEL_RANK }
