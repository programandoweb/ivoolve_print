'use strict'
const os = require('node:os')
const path = require('node:path')
const { AsyncLocalStorage } = require('node:async_hooks')
const { LEVELS, LEVEL_RANK, CATEGORIES, EVENT_NAME, defaultCategory } = require('./catalog')
const { cleanString, sanitizeValue, sanitizeError, MAX_LINE_BYTES } = require('./sanitize')
const { LogWriter, enforceRetention } = require('./writer')

const correlation = new AsyncLocalStorage()
const CORRELATION_ID = /^[A-Za-z0-9._:-]{8,80}$/

/**
 * Raíz de logs, coherente entre procesos:
 *   1) IVOOLVE_PRINT_LOG_DIR (si existe)  2) <userData>/logs (Electron)
 *   3) <APPDATA>/desktop/logs (API en Windows; "desktop" es el nombre de la app Electron)
 * Nunca se escribe dentro del código fuente, dist o node_modules.
 */
function resolveRoot({ userDataDir, env = process.env, platform = process.platform } = {}) {
  if (env.IVOOLVE_PRINT_LOG_DIR) return path.resolve(env.IVOOLVE_PRINT_LOG_DIR)
  if (userDataDir) return path.join(userDataDir, 'logs')
  const base = platform === 'win32'
    ? (env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : (env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'))
  return path.join(base, 'desktop', 'logs')
}

function numberEnv(env, key, fallback, min, max) {
  const n = Number(env[key])
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

function readConfig(env = process.env) {
  const level = String(env.IVOOLVE_PRINT_LOG_LEVEL || '').toLowerCase()
  return {
    level: LEVELS.includes(level) ? level : 'info', // debug solo si se pide expresamente
    retentionDays: numberEnv(env, 'IVOOLVE_PRINT_LOG_RETENTION_DAYS', 14, 1, 365),
    maxTotalBytes: numberEnv(env, 'IVOOLVE_PRINT_LOG_MAX_MB', 250, 10, 5000) * 1024 * 1024,
    maxFileBytes: numberEnv(env, 'IVOOLVE_PRINT_LOG_FILE_MB', 10, 1, 100) * 1024 * 1024,
  }
}

function createLogger({ root, component, processName = 'main', writerName = component, stationId, env = process.env, writer, retention = true, now = () => new Date() } = {}) {
  const config = readConfig(env)
  const seenErrors = new WeakSet()
  const sampled = new Map()
  let station = typeof stationId === 'string' ? stationId : undefined
  let minRank = LEVEL_RANK[config.level]

  const instance = writer || new LogWriter({
    dir: path.join(root, writerName), prefix: writerName, maxFileBytes: config.maxFileBytes,
    noticeFactory: count => JSON.stringify({
      timestamp: now().toISOString(), level: 'warn', category: 'system', event: 'log.events_dropped',
      message: `Se descartaron ${count} eventos de log (cola llena o fallo de escritura).`,
      component, process: processName, metadata: { dropped: count },
    }),
  })

  function build(level, event, message, opts = {}) {
    let name = event
    let extra
    if (typeof name !== 'string' || !EVENT_NAME.test(name)) { extra = { original_event: cleanString(String(event), 60) }; name = 'log.invalid_event' }
    const category = CATEGORIES.includes(opts.category) ? opts.category : defaultCategory(name)
    const entry = {
      timestamp: now().toISOString(), level, category, event: name,
      message: cleanString(message ?? '', 300), component: opts.component || component, process: opts.process || processName,
    }
    const cid = opts.correlation_id || correlation.getStore()
    if (typeof cid === 'string' && CORRELATION_ID.test(cid)) entry.correlation_id = cid
    if (station) entry.station_id = station
    if (Number.isFinite(opts.duration_ms)) entry.duration_ms = Math.max(0, Math.round(opts.duration_ms))
    const metadata = sanitizeValue({ ...(extra || {}), ...(opts.metadata || {}) })
    if (metadata && Object.keys(metadata).length) entry.metadata = metadata
    if (opts.error !== undefined && opts.error !== null) entry.error = sanitizeError(opts.error)
    let line = JSON.stringify(entry)
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) { // recorte defensivo: se conserva lo esencial
      delete entry.metadata
      if (entry.error?.stack) entry.error.stack = entry.error.stack.slice(0, 600)
      entry.message = entry.message.slice(0, 200)
      line = JSON.stringify(entry)
    }
    return line
  }

  function log(level, event, message, opts = {}) {
    try {
      if (!LEVELS.includes(level) || LEVEL_RANK[level] < minRank) return false
      const err = opts.error
      if (opts.dedupe && err && typeof err === 'object') { if (seenErrors.has(err)) return false }
      if (err && typeof err === 'object') seenErrors.add(err)
      return instance.write(build(level, event, message, opts))
    } catch (error) {
      try { process.stderr.write(`[ivoolve-logging] logger error: ${String(error?.message || error).slice(0, 120)}\n`) } catch { /* nada */ }
      return false
    }
  }

  // Muestreo anti-saturación: registra el 1.º fallo y luego en potencias de 2 / cada 64.
  // `recovered` registra una sola vez la recuperación con el total de fallos previos.
  const sampler = {
    fail(key, level, event, message, opts = {}) {
      const state = sampled.get(key) || { count: 0, since: Date.now() }
      state.count++; sampled.set(key, state)
      const n = state.count
      if (n === 1 || (n & (n - 1)) === 0 || n % 64 === 0) {
        return log(level, event, message, { ...opts, metadata: { ...(opts.metadata || {}), consecutive_failures: n } })
      }
      return false
    },
    ok(key, event, message, opts = {}) {
      const state = sampled.get(key)
      if (!state) return false
      sampled.delete(key)
      return log('info', event, message, { ...opts, duration_ms: Date.now() - state.since, metadata: { ...(opts.metadata || {}), previous_failures: state.count } })
    },
    failing: key => sampled.has(key),
    clear: key => { sampled.delete(key) },
  }

  const api = {
    config, root, component,
    log,
    debug: (event, message, opts) => log('debug', event, message, opts),
    info: (event, message, opts) => log('info', event, message, opts),
    warn: (event, message, opts) => log('warn', event, message, opts),
    error: (event, message, opts) => log('error', event, message, opts),
    fatal: (event, message, opts) => log('fatal', event, message, opts),
    sampler,
    setStationId: value => { station = typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value) ? value : station },
    setLevel: value => { if (LEVELS.includes(value)) minRank = LEVEL_RANK[value] },
    isEnabled: level => LEVEL_RANK[level] >= minRank,
    flush: () => instance.flush(),
    flushSync: () => instance.flushSync(),
    close: () => instance.close(),
    stats: () => instance.stats(),
    // Ejecuta `fn` con un correlation_id que heredan todos los logs (y las llamadas hijas).
    withCorrelation: (id, fn) => {
      const current = correlation.getStore()
      const use = typeof id === 'string' && CORRELATION_ID.test(id) ? id : current || require('node:crypto').randomUUID()
      return current === use ? fn() : correlation.run(use, fn)
    },
    currentCorrelation: () => correlation.getStore(),
    retention: () => enforceRetention(root, config).then(result => {
      if (result.deleted > 0) log('info', 'log.retention_applied', `Retención aplicada: ${result.deleted} archivos borrados.`, { metadata: result })
      return result
    }).catch(() => null),
  }

  if (retention && root) {
    api.retention()
    const timer = setInterval(() => api.retention(), 6 * 60 * 60 * 1000)
    timer.unref?.()
  }
  return api
}

module.exports = { createLogger, resolveRoot, readConfig, correlation, CORRELATION_ID }
