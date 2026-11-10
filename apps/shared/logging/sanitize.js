'use strict'
// Redacción y límites de tamaño para TODO lo que llega a un log.
// Regla: ante la duda, se redacta. Nunca lanza.
const os = require('node:os')

const MAX_STRING = 500
const MAX_STACK = 2000
const MAX_DEPTH = 4
const MAX_KEYS = 30
const MAX_ITEMS = 20
const MAX_LINE_BYTES = 16 * 1024

// Claves cuyo valor nunca se registra (coincidencia por fragmento, sin distinguir mayúsculas).
const SENSITIVE_KEY = /(token|secret|passw|authorization|cookie|api[-_]?key|apikey|jwt|bearer|credential|session|signature|private|payload|body|base64|pdf|html|content|document|email|phone|telefono|celular|cedula|address|direccion|history|text)/i
// Claves de documentos de negocio que se redactan solo por coincidencia exacta.
const SENSITIVE_EXACT = /^(name|nombre|title|variant|variant_name|query|nit)$/i

const RULES = [
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[REDACTED_JWT]'],
  [/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [REDACTED]'],
  [/data:[\w\/+.-]+;base64,[A-Za-z0-9+\/=]+/gi, '[REDACTED_DATA_URI]'],
  [/(\w[\w+.-]*:\/\/)[^\/\s:@]+:[^\/\s@]*@/g, '$1[REDACTED]@'],
  [/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>]*/gi, '$1?[REDACTED_QUERY]'],
  [/\b(token|password|passwd|secret|api[_-]?key|apikey|authorization|cookie)\s*[:=]\s*[^\s,;&"']+/gi, '$1=[REDACTED]'],
  [/[A-Za-z0-9+\/]{200,}={0,2}/g, '[REDACTED_BLOB]'],
]

let homePatterns
function homeRules() {
  if (homePatterns) return homePatterns
  homePatterns = []
  try {
    const home = os.homedir()
    if (home && home.length > 3) homePatterns.push(new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))
  } catch { /* sin home */ }
  return homePatterns
}

function cleanString(value, max = MAX_STRING) {
  let text = String(value)
  for (const [pattern, replacement] of RULES) text = text.replace(pattern, replacement)
  text = text.replace(/([A-Za-z]:\\Users\\)[^\\\s]+/gi, '$1<user>')
  for (const pattern of homeRules()) text = text.replace(pattern, '~')
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  if (text.length > max) text = text.slice(0, max) + `…[+${text.length - max}]`
  return text
}

function isSensitiveKey(key) {
  return SENSITIVE_KEY.test(key) || SENSITIVE_EXACT.test(key)
}

function sanitizeValue(value, depth = 0, seen = new WeakSet()) {
  try {
    if (value === null || value === undefined) return undefined
    const type = typeof value
    if (type === 'string') return cleanString(value)
    if (type === 'number') return Number.isFinite(value) ? value : String(value)
    if (type === 'boolean') return value
    if (type === 'bigint') return String(value)
    if (type === 'function' || type === 'symbol') return undefined
    if (Buffer.isBuffer(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return `[binary ${value.byteLength} bytes]`
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : undefined
    if (value instanceof Error) return { name: cleanString(value.name, 80), message: cleanString(value.message) }
    if (depth >= MAX_DEPTH) return '[depth-limit]'
    if (seen.has(value)) return '[circular]'
    seen.add(value)
    if (Array.isArray(value)) {
      const out = value.slice(0, MAX_ITEMS).map(item => sanitizeValue(item, depth + 1, seen))
      if (value.length > MAX_ITEMS) out.push(`[+${value.length - MAX_ITEMS} items]`)
      return out
    }
    const out = {}
    let count = 0
    for (const [key, inner] of Object.entries(value)) {
      if (++count > MAX_KEYS) { out['[truncated]'] = true; break }
      const safeKey = cleanString(key, 60)
      if (isSensitiveKey(key)) { out[safeKey] = '[REDACTED]'; continue }
      const clean = sanitizeValue(inner, depth + 1, seen)
      if (clean !== undefined) out[safeKey] = clean
    }
    return out
  } catch {
    return '[unserializable]'
  }
}

function sanitizeStack(stack) {
  if (typeof stack !== 'string' || !stack) return undefined
  return cleanString(stack.split('\n').slice(0, 12).join('\n'), MAX_STACK)
}

// Normaliza cualquier "error" (Error, string, objeto) al contrato { name, code?, message?, stack? }.
function sanitizeError(error) {
  try {
    if (error === null || error === undefined) return undefined
    if (error instanceof Error || (typeof error === 'object' && ('message' in error || 'name' in error || 'stack' in error))) {
      const out = { name: cleanString(error.name || 'Error', 80) }
      if (error.code !== undefined && error.code !== null && ['string', 'number'].includes(typeof error.code)) out.code = cleanString(error.code, 80)
      if (error.message) out.message = cleanString(error.message)
      const stack = sanitizeStack(error.stack)
      if (stack) out.stack = stack
      return out
    }
    return { name: 'NonError', message: cleanString(typeof error === 'string' ? error : JSON.stringify(sanitizeValue(error))) }
  } catch {
    return { name: 'UnserializableError' }
  }
}

// Vuelve a pasar un evento ya parseado por el filtro de campos permitidos
// (se usa al LEER, para que un archivo manipulado tampoco filtre secretos).
function sanitizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null
  const { LEVELS, CATEGORIES } = require('./catalog')
  const str = (v, max) => (typeof v === 'string' && v ? cleanString(v, max) : undefined)
  const out = {
    timestamp: typeof raw.timestamp === 'string' && Number.isFinite(Date.parse(raw.timestamp)) ? new Date(raw.timestamp).toISOString() : null,
    level: LEVELS.includes(raw.level) ? raw.level : 'info',
    category: CATEGORIES.includes(raw.category) ? raw.category : 'execution',
    event: str(raw.event, 90) || 'log.invalid_event',
    message: str(raw.message) || '',
    component: str(raw.component, 30),
    process: str(raw.process, 30),
    correlation_id: str(raw.correlation_id, 80),
    station_id: str(raw.station_id, 80),
    duration_ms: Number.isFinite(raw.duration_ms) ? Math.round(raw.duration_ms) : undefined,
    metadata: raw.metadata && typeof raw.metadata === 'object' ? sanitizeValue(raw.metadata) : undefined,
    error: raw.error ? sanitizeError(raw.error) : undefined,
  }
  if (!out.timestamp) return null
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key]
  return out
}

module.exports = { cleanString, sanitizeValue, sanitizeError, sanitizeEvent, isSensitiveKey, MAX_LINE_BYTES, MAX_STRING }
