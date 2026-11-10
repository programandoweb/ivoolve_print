'use strict'
// Historial de impresiones de ivoolve_print: trazabilidad de QUIÉN mandó a imprimir y QUÉ
// (tipo, lote, documento, cantidades), con estado final y motivo del fallo.
// Es independiente de los logs técnicos (apps/shared/logging) y se guarda aparte.
//
// IMPORTANTE: "submitted" significa que la llamada de impresión terminó sin error técnico
// (el diálogo/cola de Windows aceptó el trabajo). NO confirma salida física del papel.
//
// Formato: JSON Lines, DOS líneas por intento (append-only):
//   { phase:'requested', attempt_id, ... }  al empezar  → si el proceso muere, queda como "interrumpido"
//   { phase:'finished',  attempt_id, status, reason?, duration_ms, result? } al terminar
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const { LogWriter, enforceRetention, FILE_PATTERN } = require('../logging/writer')
const { cleanString } = require('../logging/sanitize')

const KINDS = Object.freeze(['labels', 'letterhead'])
const ORIGINS = Object.freeze(['manual_labels', 'manual_letterhead', 'prisma_assistant', 'prisma_supervised'])
const STATUSES = Object.freeze(['submitted', 'failed', 'cancelled', 'ambiguous', 'pending', 'interrupted'])
const ACTOR_SOURCES = Object.freeze(['job_requester', 'logged_in_user', 'unknown'])
const PREFIX = 'prints'
const DAY = 24 * 60 * 60 * 1000
const PENDING_GRACE_MS = 10 * 60 * 1000 // un intento sin cierre pasa de "pendiente" a "interrumpido" tras 10 min
const MAX_ITEMS = 40
const LIMITS = Object.freeze({ maxPageSize: 100, maxWindow: 5000, maxExport: 10000, maxAttempts: 50000, maxSearch: 100 })

const str = (value, max) => (value === undefined || value === null || value === '' ? undefined : cleanString(String(value), max))
const int = (value, max = 1e9) => (Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) <= max ? Number(value) : undefined)
const clean = obj => { for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k]; return obj }

/** Persona responsable. `source` indica de dónde sale: pedidor del trabajo, usuario logueado o desconocido. */
function normalizeActor(raw, source = 'logged_in_user') {
  if (!raw || typeof raw !== 'object') return { source: 'unknown' }
  const id = str(raw.id, 40); const name = str(raw.name, 80)
  if (!id && !name) return { source: 'unknown' }
  return clean({ id, name, role: str(raw.role, 60), source: ACTOR_SOURCES.includes(source) ? source : 'logged_in_user' })
}

/** Qué se mandó a imprimir (solo campos de negocio acotados; jamás tokens, cuerpos ni PDFs). */
function describeInput(kind, payload, context = {}) {
  const meta = context?.jobMeta && typeof context.jobMeta === 'object' ? context.jobMeta : {}
  const document = {}
  if (kind === 'labels') {
    const rows = Array.isArray(payload?.print) ? payload.print : []
    document.items = rows.slice(0, MAX_ITEMS).map(r => clean({ code: str(r?.code, 60), title: str(r?.title, 80), variant: str(r?.variant_name ?? r?.variant, 60), quantity: int(r?.quantity, 1e6) }))
    document.total_quantity = rows.reduce((sum, r) => sum + (int(r?.quantity, 1e6) || 0), 0)
    if (rows.length > MAX_ITEMS) document.items_truncated = rows.length - MAX_ITEMS
    document.batch_code = str(String(payload?.batch_code ?? '').replace(/^LOT-/i, ''), 40) // lote
    document.abbreviation = str(payload?.abbreviation ?? rows[0]?.abbreviation, 20)
  } else {
    document.number = str(payload?.number ?? meta.document_number, 12) // número del despacho/membrete
    document.dispatch_id = int(payload?.dispatchId ?? meta.dispatch_id)
    document.total_quantity = 1
  }
  if (meta.document_number && kind === 'labels') document.document_number = str(meta.document_number, 12)
  if (meta.production_order_id !== undefined && meta.production_order_id !== null) document.production_order_id = int(meta.production_order_id)
  return { document: clean(document), job: clean({ job_id: int(meta.job_id), job_source: str(meta.job_source, 20) }) }
}

/** Resultado de las funciones de impresión ({ok,...}) → estado + motivo. */
function mapResult(result) {
  if (result?.ok === true && result.status === 'choose') return { status: 'ambiguous', reason: 'Hay varios despachos con ese número; no se imprimió nada.' }
  if (result?.ok === true) return { status: 'submitted', result: clean({ pages: int(result.pages, 1000), scaled: typeof result.scaled === 'boolean' ? result.scaled : undefined }) }
  const reason = str(result?.message ?? result?.error ?? 'Sin detalle', 300)
  // Solo "cancelado" cuando Electron lo informa explícitamente (errorType); un mensaje ambiguo
  // como "cancelada o falló" se deja como fallo con su texto, sin afirmar más de lo que se sabe.
  return { status: /^cancel+ed$/i.test((reason || '').trim()) ? 'cancelled' : 'failed', reason }
}

function resolveHistoryRoot({ userDataDir, env = process.env } = {}) {
  if (env.IVOOLVE_PRINT_HISTORY_DIR) return path.resolve(env.IVOOLVE_PRINT_HISTORY_DIR)
  if (!userDataDir) throw Error('Falta el directorio de datos de usuario.')
  return path.join(userDataDir, 'print-history')
}

function numberEnv(env, key, fallback, min, max) {
  const n = Number(env[key]); return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

function createRecorder({ root, stationId, env = process.env, now = () => new Date(), writer, retention = true } = {}) {
  let station = typeof stationId === 'string' ? stationId : undefined
  const config = {
    retentionDays: numberEnv(env, 'IVOOLVE_PRINT_HISTORY_RETENTION_DAYS', 365, 1, 3650),
    maxTotalBytes: numberEnv(env, 'IVOOLVE_PRINT_HISTORY_MAX_MB', 500, 10, 10000) * 1024 * 1024,
  }
  // Auditoría: cola amplia y vaciado inmediato (el volumen es bajo: decenas de impresiones por hora).
  const instance = writer || new LogWriter({ dir: path.join(root, 'records'), prefix: PREFIX, maxQueue: 10000, maxQueueBytes: 16 * 1024 * 1024, flushMs: 20, maxFileBytes: 20 * 1024 * 1024 })
  const emit = entry => { try { instance.write(JSON.stringify(entry)); void instance.flush() } catch { /* el historial nunca rompe la impresión */ } }
  const retain = () => enforceRetention(root, config).catch(() => null)
  if (retention) { retain(); const t = setInterval(retain, 6 * 60 * 60 * 1000); t.unref?.() }

  return {
    config, root, stats: () => instance.stats(),
    setStationId: id => { if (typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) station = id },
    flush: () => instance.flush(), flushSync: () => instance.flushSync(), close: () => instance.close(),
    /** Registra la solicitud y devuelve el cierre del intento. Nunca lanza. */
    begin({ kind, origin, actor, payload, context, correlationId }) {
      const started = Date.now(); const attemptId = randomUUID()
      try {
        const described = describeInput(kind, payload, context)
        emit(clean({
          v: 1, phase: 'requested', attempt_id: attemptId, timestamp: now().toISOString(),
          kind: KINDS.includes(kind) ? kind : 'labels', origin: ORIGINS.includes(origin) ? origin : 'manual_labels',
          actor: normalizeActor(actor?.value, actor?.source), station_id: station,
          document: described.document, ...described.job,
          silent: typeof context?.prismaConfirmed === 'boolean' ? context.prismaConfirmed : undefined,
          correlation_id: str(correlationId, 80),
        }))
      } catch { /* sin registro */ }
      let closed = false
      const close = outcome => {
        if (closed) return; closed = true
        try { emit(clean({ v: 1, phase: 'finished', attempt_id: attemptId, timestamp: now().toISOString(), duration_ms: Date.now() - started, ...outcome })) } catch { /* sin registro */ }
      }
      return {
        attemptId,
        finish: result => close(mapResult(result)),
        fail: error => close({ status: 'failed', reason: str(error?.message || 'La función de impresión lanzó una excepción', 300) }),
      }
    },
  }
}

// ---- lectura ---------------------------------------------------------------------------------

function toMs(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const ms = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(ms) ? ms : fallback
}
const pick = (list, allowed) => { if (!Array.isArray(list)) return null; const out = [...new Set(list.filter(i => allowed.includes(i)))]; return out.length ? out : null }

function normalizeQuery(raw = {}, { exporting = false } = {}) {
  const q = raw && typeof raw === 'object' ? raw : {}
  let to = toMs(q.to, Date.now()); let from = toMs(q.from, to - DAY)
  if (from > to) [from, to] = [to, from]
  const pageSize = exporting ? LIMITS.maxExport : Math.min(Math.max(Math.trunc(Number(q.pageSize)) || 50, 1), LIMITS.maxPageSize)
  let page = Math.max(Math.trunc(Number(q.page)) || 1, 1)
  if (!exporting && page * pageSize > LIMITS.maxWindow) page = Math.max(1, Math.floor(LIMITS.maxWindow / pageSize))
  return {
    from, to, page, pageSize,
    search: typeof q.search === 'string' ? q.search.trim().slice(0, LIMITS.maxSearch).toLowerCase() : '',
    kinds: pick(q.kinds, KINDS), statuses: pick(q.statuses, STATUSES), origins: pick(q.origins, ORIGINS),
  }
}

function sanitizeRecord(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.attempt_id !== 'string' || !/^[0-9a-f-]{36}$/.test(raw.attempt_id)) return null
  const ts = Date.parse(raw.timestamp); if (!Number.isFinite(ts)) return null
  const out = { phase: raw.phase === 'finished' ? 'finished' : 'requested', attempt_id: raw.attempt_id, timestamp: new Date(ts).toISOString() }
  if (out.phase === 'requested') {
    Object.assign(out, clean({
      kind: KINDS.includes(raw.kind) ? raw.kind : 'labels', origin: ORIGINS.includes(raw.origin) ? raw.origin : 'manual_labels',
      actor: normalizeActor(raw.actor, raw.actor?.source), station_id: str(raw.station_id, 80),
      job_id: int(raw.job_id), job_source: str(raw.job_source, 20), silent: typeof raw.silent === 'boolean' ? raw.silent : undefined,
      correlation_id: str(raw.correlation_id, 80), document: sanitizeDocument(raw.document),
    }))
  } else {
    Object.assign(out, clean({
      status: STATUSES.includes(raw.status) ? raw.status : 'failed', reason: str(raw.reason, 300), duration_ms: int(raw.duration_ms),
      result: raw.result && typeof raw.result === 'object' ? clean({ pages: int(raw.result.pages, 1000), scaled: typeof raw.result.scaled === 'boolean' ? raw.result.scaled : undefined }) : undefined,
    }))
  }
  return out
}
function sanitizeDocument(d) {
  if (!d || typeof d !== 'object') return {}
  return clean({
    batch_code: str(d.batch_code, 40), abbreviation: str(d.abbreviation, 20), number: str(d.number, 12), document_number: str(d.document_number, 12),
    dispatch_id: int(d.dispatch_id), production_order_id: int(d.production_order_id), total_quantity: int(d.total_quantity, 1e9),
    items_truncated: int(d.items_truncated),
    items: Array.isArray(d.items) ? d.items.slice(0, MAX_ITEMS).map(i => clean({ code: str(i?.code, 60), title: str(i?.title, 80), variant: str(i?.variant, 60), quantity: int(i?.quantity, 1e6) })) : undefined,
  })
}

async function listFiles(root, query) {
  const dir = path.join(root, 'records')
  let names = []
  try { names = await fs.promises.readdir(dir) } catch { return [] }
  const fromDay = new Date(query.from - DAY).toISOString().slice(0, 10) // el cierre puede caer al día siguiente
  const toDay = new Date(query.to + DAY).toISOString().slice(0, 10)
  return names.map(name => { const m = FILE_PATTERN.exec(name); return m && m[1] === PREFIX && m[2] >= fromDay && m[2] <= toDay ? path.join(dir, name) : null }).filter(Boolean).sort()
}

function merge(request, finish, nowMs) {
  const ageMs = nowMs - Date.parse(request.timestamp)
  const status = finish ? finish.status : (ageMs < PENDING_GRACE_MS ? 'pending' : 'interrupted')
  return clean({
    attempt_id: request.attempt_id, requested_at: request.timestamp, finished_at: finish?.timestamp, status,
    reason: finish?.reason ?? (status === 'interrupted' ? 'El intento no registró cierre (la aplicación se cerró o falló durante la impresión).' : undefined),
    duration_ms: finish?.duration_ms, kind: request.kind, origin: request.origin, actor: request.actor, station_id: request.station_id,
    document: request.document, job_id: request.job_id, job_source: request.job_source, silent: request.silent,
    correlation_id: request.correlation_id, result: finish?.result,
  })
}

function matches(item, query) {
  const t = Date.parse(item.requested_at)
  if (t < query.from || t > query.to) return false
  if (query.kinds && !query.kinds.includes(item.kind)) return false
  if (query.statuses && !query.statuses.includes(item.status)) return false
  if (query.origins && !query.origins.includes(item.origin)) return false
  if (query.search) {
    const d = item.document || {}
    // Los UUID solo cuentan en búsquedas largas: un "07" no debe coincidir con dígitos de un id aleatorio.
    const ids = query.search.length >= 8 ? [item.attempt_id, item.correlation_id] : []
    const hay = [item.actor?.name, item.actor?.id, d.batch_code, d.number, d.document_number, d.abbreviation, ...ids, item.reason, item.job_id, ...(d.items || []).flatMap(i => [i.code, i.title, i.variant])].filter(v => v !== undefined).join(' ').toLowerCase()
    if (!hay.includes(query.search)) return false
  }
  return true
}

/** Intentos de impresión (solicitud + cierre fusionados), del más reciente al más antiguo. */
async function queryPrints(root, rawQuery, options = {}) {
  const query = normalizeQuery(rawQuery, options)
  const requests = new Map(); const finishes = new Map()
  let corrupt = 0; let truncated = false
  outer: for (const file of await listFiles(root, query)) {
    const lines = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
    try {
      for await (const line of lines) {
        if (!line) continue
        let record; try { record = sanitizeRecord(JSON.parse(line)) } catch { record = null }
        if (!record) { corrupt++; continue }
        if (record.phase === 'requested') requests.set(record.attempt_id, record); else finishes.set(record.attempt_id, record)
        if (requests.size > LIMITS.maxAttempts) { truncated = true; lines.close(); break outer }
      }
    } catch { corrupt++ } finally { lines.close() }
  }
  const nowMs = Date.now()
  const all = [...requests.values()].map(r => merge(r, finishes.get(r.attempt_id), nowMs)).filter(i => matches(i, query))
    .sort((a, b) => (a.requested_at === b.requested_at ? 0 : a.requested_at < b.requested_at ? 1 : -1))
  const offset = (query.page - 1) * query.pageSize
  const summary = all.reduce((acc, i) => { acc.by_status[i.status] = (acc.by_status[i.status] || 0) + 1; acc.total_quantity += i.status === 'submitted' ? (i.document?.total_quantity || 0) : 0; return acc }, { by_status: {}, total_quantity: 0 })
  return { items: all.slice(offset, offset + query.pageSize), page: query.page, pageSize: query.pageSize, total: all.length, hasMore: all.length > offset + query.pageSize, truncated, corrupt, summary }
}

const csvCell = value => {
  let text = value === undefined || value === null ? '' : typeof value === 'string' ? value : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
const CSV_COLUMNS = ['solicitado', 'finalizado', 'estado', 'motivo', 'tipo', 'origen', 'usuario_id', 'usuario', 'rol', 'fuente_usuario', 'lote', 'documento', 'despacho_id', 'trabajo_id', 'cantidad_total', 'detalle', 'estacion', 'correlation_id', 'intento_id', 'duracion_ms']

/** JSONL o CSV (orden cronológico ascendente) de intentos ya saneados. */
function serialize(items, format) {
  const ordered = [...items].sort((a, b) => (a.requested_at < b.requested_at ? -1 : a.requested_at > b.requested_at ? 1 : 0))
  if (format === 'csv') {
    const rows = ordered.map(i => {
      const d = i.document || {}
      const detail = (d.items || []).map(x => `${x.code || ''} ${x.variant || ''} x${x.quantity ?? ''}`.trim()).join('; ')
      return [i.requested_at, i.finished_at, i.status, i.reason, i.kind, i.origin, i.actor?.id, i.actor?.name, i.actor?.role, i.actor?.source, d.batch_code, d.number || d.document_number, d.dispatch_id, i.job_id, d.total_quantity, detail, i.station_id, i.correlation_id, i.attempt_id, i.duration_ms].map(csvCell).join(',')
    })
    return '﻿' + [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n'
  }
  return ordered.map(i => JSON.stringify(i)).join('\n') + (ordered.length ? '\n' : '')
}

async function infoPrints(root) {
  const out = { files: 0, bytes: 0, oldest: null, newest: null }
  let names = []
  try { names = await fs.promises.readdir(path.join(root, 'records')) } catch { return out }
  for (const name of names) {
    const m = FILE_PATTERN.exec(name); if (!m || m[1] !== PREFIX) continue
    try { out.bytes += (await fs.promises.stat(path.join(root, 'records', name))).size } catch { continue }
    out.files++; if (!out.oldest || m[2] < out.oldest) out.oldest = m[2]; if (!out.newest || m[2] > out.newest) out.newest = m[2]
  }
  return out
}

module.exports = {
  KINDS, ORIGINS, STATUSES, LIMITS, normalizeActor, describeInput, mapResult, resolveHistoryRoot, createRecorder,
  queryPrints, normalizeQuery, serialize, infoPrints, sanitizeRecord,
}
