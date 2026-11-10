'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { FiCopy, FiDownload, FiList, FiRefreshCw, FiX } from 'react-icons/fi'

/**
 * Módulo "Logs": consulta de los registros TÉCNICOS locales (Electron + API) de ivoolve_print.
 * No es auditoría de impresiones ni demuestra salida física de papel.
 * Solo existe dentro de la app de escritorio: depende de `window.ivoolveLogs` (preload).
 */

type Level = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

interface LogEvent {
  timestamp: string
  level: Level
  category: string
  event: string
  message: string
  component?: string
  process?: string
  correlation_id?: string
  station_id?: string
  duration_ms?: number
  metadata?: Record<string, unknown>
  error?: { name: string; code?: string; message?: string; stack?: string }
}

interface QueryResult {
  ok: boolean
  error?: string
  items: LogEvent[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
  truncated: boolean
  corrupt: number
}

interface LogsInfo {
  ok: boolean
  files?: number
  bytes?: number
  level?: string
  retentionDays?: number
  maxTotalMb?: number
  dropped?: number
}

interface LogsApi {
  query: (value: unknown) => Promise<QueryResult>
  info: () => Promise<LogsInfo>
  export: (value: unknown) => Promise<{ ok: boolean; cancelled?: boolean; count?: number; truncated?: boolean; error?: string }>
  report: (value: unknown) => Promise<{ ok: boolean }>
}

declare global {
  interface Window {
    ivoolveLogs?: LogsApi
  }
}

const LEVELS: Level[] = ['debug', 'info', 'warn', 'error', 'fatal']
const LEVEL_LABEL: Record<Level, string> = { debug: 'Debug', info: 'Info', warn: 'Aviso', error: 'Error', fatal: 'Fatal' }
const LEVEL_STYLE: Record<Level, string> = {
  debug: 'bg-slate-100 text-slate-600',
  info: 'bg-sky-100 text-sky-700',
  warn: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-700',
  fatal: 'bg-purple-200 text-purple-900',
}
const CATEGORIES: Record<string, string> = {
  execution: 'Ejecución', error: 'Error', printing_technical: 'Impresión (técnico)', connection: 'Conexión',
  polling: 'Polling', configuration: 'Configuración', security: 'Seguridad', system: 'Sistema',
}
const COMPONENTS: Record<string, string> = { electron: 'Electron', api: 'API', frontend: 'Interfaz' }
const PERIODS: Record<string, { label: string; ms: number }> = {
  '1h': { label: 'Última hora', ms: 3600_000 },
  '24h': { label: 'Últimas 24 h', ms: 86_400_000 },
  '7d': { label: 'Últimos 7 días', ms: 7 * 86_400_000 },
  '14d': { label: 'Últimos 14 días', ms: 14 * 86_400_000 },
}
const PAGE_SIZE = 50

interface Filters { period: string; category: string; minLevel: string; component: string; search: string }
const DEFAULT_FILTERS: Filters = { period: '24h', category: '', minLevel: '', component: '', search: '' }

function buildQuery(filters: Filters, page: number) {
  const to = Date.now()
  return {
    from: new Date(to - (PERIODS[filters.period]?.ms ?? PERIODS['24h'].ms)).toISOString(),
    to: new Date(to).toISOString(),
    page,
    pageSize: PAGE_SIZE,
    search: filters.search.trim() || undefined,
    levels: filters.minLevel ? LEVELS.slice(LEVELS.indexOf(filters.minLevel as Level)) : undefined,
    categories: filters.category ? [filters.category] : undefined,
    components: filters.component ? [filters.component] : undefined,
  }
}

const shortTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'medium' })
const longTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeStyle: 'long' })
const formatShort = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : shortTime.format(d) }
const formatLong = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : `${longTime.format(d)} · ${iso}` }

// Detecta el preload sin efectos: se vuelve a comprobar al enfocar la ventana.
function subscribeApi(onChange: () => void) {
  window.addEventListener('focus', onChange)
  return () => window.removeEventListener('focus', onChange)
}
const hasApi = () => typeof window !== 'undefined' && Boolean(window.ivoolveLogs)

export default function LogsViewer() {
  const available = useSyncExternalStore(subscribeApi, hasApi, () => false)
  const dialog = useRef<HTMLDialogElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)
  const reported = useRef({ start: 0, count: 0 })
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [info, setInfo] = useState<LogsInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<LogEvent | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async (nextPage: number, nextFilters: Filters) => {
    const api = window.ivoolveLogs
    if (!api) return
    const id = ++requestId.current
    setLoading(true); setError('')
    try {
      const response = await api.query(buildQuery(nextFilters, nextPage))
      if (id !== requestId.current) return // llegó una respuesta más nueva
      if (!response?.ok) { setError(response?.error || 'No fue posible leer los registros locales.'); setResult(null) }
      else { setResult(response); setPage(response.page) }
    } catch {
      if (id === requestId.current) { setError('No fue posible leer los registros locales. Reinicia Ivoolve Print actualizado.'); setResult(null) }
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  const loadInfo = useCallback(async () => {
    try { setInfo(await window.ivoolveLogs?.info() ?? null) } catch { setInfo(null) }
  }, [])

  function openViewer() {
    setNotice(''); setSelected(null)
    if (!dialog.current?.open) dialog.current?.showModal()
    void load(1, filters)
    void loadInfo()
  }

  // Cambios de filtro: consulta inmediata (o con espera breve al escribir la búsqueda).
  function changeFilter(patch: Partial<Filters>, delay = 0) {
    const next = { ...filters, ...patch }
    setFilters(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void load(1, next) }, delay)
  }

  async function exportLogs(format: 'jsonl' | 'csv') {
    setNotice('')
    try {
      const response = await window.ivoolveLogs?.export({ format, query: buildQuery(filters, 1) })
      if (!response?.ok) setNotice(response?.error || 'No fue posible exportar los registros.')
      else if (response.cancelled) setNotice('Exportación cancelada.')
      else setNotice(`Se exportaron ${response.count ?? 0} registros saneados${response.truncated ? ' (límite de exportación alcanzado)' : ''}.`)
    } catch {
      setNotice('No fue posible exportar los registros.')
    }
  }

  async function copyCorrelation(value: string) {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const area = document.createElement('textarea')
      area.value = value; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0'
      document.body.appendChild(area); area.select()
      try { document.execCommand('copy') } catch { /* sin portapapeles */ }
      area.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Errores no controlados de la interfaz → log técnico local (máx. 5 por minuto desde el cliente).
  useEffect(() => {
    if (!available) return
    const send = (source: string, name: string, message: string, stack?: string) => {
      const now = Date.now()
      if (now - reported.current.start > 60_000) reported.current = { start: now, count: 0 }
      if (++reported.current.count > 5) return
      window.ivoolveLogs?.report({ event: 'ui.error_unhandled', source, name, message: message.slice(0, 300), stack: stack?.slice(0, 2000) }).catch(() => {})
    }
    const onError = (e: ErrorEvent) => send('window.onerror', e.error?.name || 'Error', e.message || 'Error de interfaz', e.error?.stack)
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      send('unhandledrejection', reason?.name || 'Error', String(reason?.message ?? reason ?? 'Promesa rechazada'), reason?.stack)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection) }
  }, [available])

  if (!available) return null

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)
  const select = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-pink-500'

  return (
    <>
      <button
        type="button"
        onClick={openViewer}
        title="Ver logs técnicos"
        aria-label="Ver logs técnicos"
        className="fixed right-[4.5rem] top-4 z-[60] flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-md transition hover:border-pink-300 hover:text-pink-600 focus-visible:outline-2 focus-visible:outline-pink-500 sm:right-[12.5rem]"
      >
        <FiList size={20} aria-hidden="true" />
        <span className="hidden sm:inline">Logs</span>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="logs-title"
        onCancel={(e) => { if (selected) { e.preventDefault(); setSelected(null) } }}
        className="fixed inset-0 m-auto h-[90vh] w-[calc(100%-1rem)] max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-700 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="relative flex h-full flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-5">
            <div>
              <h2 id="logs-title" className="text-lg font-semibold text-slate-900">Logs técnicos</h2>
              <p className="text-xs text-slate-500">
                Diagnóstico local de Electron y la API. No es auditoría de impresiones ni confirma salida física del papel.
              </p>
            </div>
            <button type="button" aria-label="Cerrar logs" onClick={() => dialog.current?.close()} className="rounded-lg p-2 hover:bg-slate-100"><FiX size={20} /></button>
          </header>

          <section aria-label="Filtros" className="grid grid-cols-2 gap-2 border-b border-slate-200 px-4 py-3 sm:px-5 md:grid-cols-6">
            <select aria-label="Periodo" className={select} value={filters.period} onChange={(e) => changeFilter({ period: e.target.value })}>
              {Object.entries(PERIODS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
            </select>
            <select aria-label="Severidad mínima" className={select} value={filters.minLevel} onChange={(e) => changeFilter({ minLevel: e.target.value })}>
              <option value="">Toda severidad</option>
              {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]} o superior</option>)}
            </select>
            <select aria-label="Categoría" className={select} value={filters.category} onChange={(e) => changeFilter({ category: e.target.value })}>
              <option value="">Toda categoría</option>
              {Object.entries(CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select aria-label="Componente" className={select} value={filters.component} onChange={(e) => changeFilter({ component: e.target.value })}>
              <option value="">Todo componente</option>
              {Object.entries(COMPONENTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <input
              type="search" aria-label="Buscar en los registros" placeholder="Buscar evento, mensaje o correlación"
              value={filters.search} maxLength={100}
              onChange={(e) => changeFilter({ search: e.target.value }, 350)}
              className={`${select} col-span-2 md:col-span-2`}
            />
          </section>

          <section aria-label="Acciones" className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2 sm:px-5">
            <button type="button" onClick={() => { void load(page, filters); void loadInfo() }} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-pink-300 hover:text-pink-600 disabled:opacity-60">
              <FiRefreshCw size={14} aria-hidden="true" className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
            <button type="button" onClick={() => void exportLogs('jsonl')} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-pink-300 hover:text-pink-600">
              <FiDownload size={14} aria-hidden="true" /> JSONL
            </button>
            <button type="button" onClick={() => void exportLogs('csv')} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-pink-300 hover:text-pink-600">
              <FiDownload size={14} aria-hidden="true" /> CSV
            </button>
            {hasFilters && (
              <button type="button" onClick={() => changeFilter(DEFAULT_FILTERS)} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 underline hover:text-pink-600">Limpiar filtros</button>
            )}
            <p role="status" className="ml-auto text-xs text-slate-500">{notice}</p>
          </section>

          <div className="min-h-0 flex-1 overflow-auto">
            {error ? (
              <p role="alert" className="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            ) : !result ? (
              <p className="m-5 text-sm text-slate-500">{loading ? 'Cargando registros…' : 'Sin datos todavía.'}</p>
            ) : result.items.length === 0 ? (
              <p className="m-5 text-sm text-slate-500">No hay registros con estos filtros en el periodo elegido.</p>
            ) : (
              <table className="w-full min-w-[40rem] table-fixed border-collapse text-left text-sm">
                <caption className="sr-only">Registros técnicos, del más reciente al más antiguo</caption>
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="w-36 px-3 py-2 sm:w-40">Fecha y hora</th>
                    <th scope="col" className="w-20 px-3 py-2">Severidad</th>
                    <th scope="col" className="hidden w-36 px-3 py-2 md:table-cell">Categoría</th>
                    <th scope="col" className="hidden w-24 px-3 py-2 md:table-cell">Componente</th>
                    <th scope="col" className="w-44 px-3 py-2 sm:w-52">Evento</th>
                    <th scope="col" className="px-3 py-2">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item, index) => (
                    <tr
                      key={`${item.timestamp}-${index}`}
                      tabIndex={0}
                      onClick={() => setSelected(item)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(item) } }}
                      aria-label={`${LEVEL_LABEL[item.level]}: ${item.event}`}
                      className="cursor-pointer border-t border-slate-100 hover:bg-pink-50/50 focus-visible:bg-pink-50 focus-visible:outline-2 focus-visible:outline-pink-500"
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{formatShort(item.timestamp)}</td>
                      <td className="px-3 py-2"><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${LEVEL_STYLE[item.level]}`}>{LEVEL_LABEL[item.level]}</span></td>
                      <td className="hidden truncate px-3 py-2 md:table-cell">{CATEGORIES[item.category] ?? item.category}</td>
                      <td className="hidden truncate px-3 py-2 md:table-cell">{COMPONENTS[item.component ?? ''] ?? item.component ?? '—'}</td>
                      <td className="truncate px-3 py-2 font-mono text-xs">{item.event}</td>
                      <td className="truncate px-3 py-2" title={item.message}>{item.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <footer className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-2 text-xs text-slate-500 sm:px-5">
            <button type="button" disabled={loading || page <= 1} onClick={() => void load(page - 1, filters)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-40">Anterior</button>
            <span>Página {page}{result ? ` · ${result.total} coincidencias` : ''}</span>
            <button type="button" disabled={loading || !result?.hasMore} onClick={() => void load(page + 1, filters)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-40">Siguiente</button>
            <span className="ml-auto">
              {result?.truncated ? 'Lectura parcial: hay más registros de los que se pueden escanear; acota el periodo. ' : ''}
              {result && result.corrupt > 0 ? `${result.corrupt} líneas ilegibles omitidas. ` : ''}
              {info?.ok ? `${info.files ?? 0} archivos · ${((info.bytes ?? 0) / 1048576).toFixed(1)} MB · retención ${info.retentionDays ?? '—'} d · nivel ${info.level ?? '—'}${info.dropped ? ` · ${info.dropped} descartados` : ''}` : ''}
            </span>
          </footer>

          {selected && (
            <aside aria-label="Detalle del registro" className="absolute inset-y-0 right-0 z-10 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <h3 className="text-base font-semibold text-slate-900">Detalle del registro</h3>
                <button type="button" aria-label="Cerrar detalle" onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-slate-100"><FiX size={18} /></button>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3 text-sm">
                <p><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${LEVEL_STYLE[selected.level]}`}>{LEVEL_LABEL[selected.level]}</span> <span className="font-mono text-xs">{selected.event}</span></p>
                <p className="leading-6">{selected.message}</p>
                <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-slate-500">Fecha local</dt><dd>{formatLong(selected.timestamp)}</dd>
                  <dt className="text-slate-500">Categoría</dt><dd>{CATEGORIES[selected.category] ?? selected.category}</dd>
                  <dt className="text-slate-500">Componente</dt><dd>{COMPONENTS[selected.component ?? ''] ?? selected.component ?? '—'}{selected.process ? ` · ${selected.process}` : ''}</dd>
                  {selected.duration_ms !== undefined && (<><dt className="text-slate-500">Duración</dt><dd>{selected.duration_ms} ms</dd></>)}
                  {selected.station_id && (<><dt className="text-slate-500">Estación</dt><dd className="break-all font-mono">{selected.station_id}</dd></>)}
                  {selected.correlation_id && (
                    <>
                      <dt className="text-slate-500">Correlación</dt>
                      <dd className="flex items-start gap-2">
                        <span className="break-all font-mono">{selected.correlation_id}</span>
                        <button type="button" onClick={() => void copyCorrelation(selected.correlation_id as string)} className="flex shrink-0 items-center gap-1 rounded-md border border-slate-300 px-1.5 py-0.5 hover:border-pink-300 hover:text-pink-600" aria-label="Copiar correlation_id">
                          <FiCopy size={12} aria-hidden="true" /> {copied ? 'Copiado' : 'Copiar'}
                        </button>
                      </dd>
                    </>
                  )}
                </dl>
                {selected.error && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Error</h4>
                    <p className="text-xs"><span className="font-semibold">{selected.error.name}</span>{selected.error.code ? ` (${selected.error.code})` : ''}{selected.error.message ? `: ${selected.error.message}` : ''}</p>
                    {selected.error.stack && <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-900 p-2 text-[11px] leading-4 text-slate-100 whitespace-pre-wrap">{selected.error.stack}</pre>}
                  </div>
                )}
                {selected.metadata && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Metadatos (saneados)</h4>
                    <pre className="max-h-56 overflow-auto rounded-lg bg-slate-100 p-2 text-[11px] leading-4 whitespace-pre-wrap">{JSON.stringify(selected.metadata, null, 2)}</pre>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </dialog>
    </>
  )
}
