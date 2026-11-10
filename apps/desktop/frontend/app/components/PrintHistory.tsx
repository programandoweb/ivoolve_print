'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { FiClipboard, FiCopy, FiDownload, FiRefreshCw, FiX } from 'react-icons/fi'

/**
 * Historial de impresiones: QUIÉN mandó a imprimir y QUÉ (tipo, lote, documento, cantidades),
 * con estado final y motivo del fallo. Es independiente de "Logs" (diagnóstico técnico).
 * "Enviado" significa que la llamada de impresión terminó sin error técnico (Windows aceptó el
 * trabajo): NO confirma que el papel haya salido físicamente.
 * Solo existe dentro de la app de escritorio: depende de `window.ivoolvePrintHistory` (preload).
 */

type Status = 'submitted' | 'failed' | 'cancelled' | 'ambiguous' | 'pending' | 'interrupted'

interface PrintItem {
  attempt_id: string
  requested_at: string
  finished_at?: string
  status: Status
  reason?: string
  duration_ms?: number
  kind: 'labels' | 'letterhead'
  origin: string
  actor?: { id?: string; name?: string; role?: string; source: string }
  station_id?: string
  job_id?: number
  job_source?: string
  silent?: boolean
  correlation_id?: string
  result?: { pages?: number; scaled?: boolean }
  document?: {
    batch_code?: string; abbreviation?: string; number?: string; document_number?: string
    dispatch_id?: number; production_order_id?: number; total_quantity?: number; items_truncated?: number
    items?: { code?: string; title?: string; variant?: string; quantity?: number }[]
  }
}

interface QueryResult {
  ok: boolean; error?: string; items: PrintItem[]; page: number; pageSize: number; total: number; hasMore: boolean
  truncated: boolean; corrupt: number; summary?: { by_status: Record<string, number>; total_quantity: number }
}
interface HistoryInfo { ok: boolean; files?: number; bytes?: number; retentionDays?: number; dropped?: number }
interface HistoryApi {
  setActor: (value: { id?: string | number; name?: string; role?: string } | null) => Promise<{ ok: boolean }>
  query: (value: unknown) => Promise<QueryResult>
  info: () => Promise<HistoryInfo>
  export: (value: unknown) => Promise<{ ok: boolean; cancelled?: boolean; count?: number; truncated?: boolean; error?: string }>
}

declare global {
  interface Window {
    ivoolvePrintHistory?: HistoryApi
  }
}

const STATUS_LABEL: Record<Status, string> = { submitted: 'Enviado', failed: 'Falló', cancelled: 'Cancelado', ambiguous: 'Ambiguo', pending: 'En curso', interrupted: 'Interrumpido' }
const STATUS_STYLE: Record<Status, string> = {
  submitted: 'bg-emerald-100 text-emerald-800', failed: 'bg-red-100 text-red-700', cancelled: 'bg-amber-100 text-amber-800',
  ambiguous: 'bg-amber-100 text-amber-800', pending: 'bg-sky-100 text-sky-700', interrupted: 'bg-purple-200 text-purple-900',
}
const KIND_LABEL: Record<string, string> = { labels: 'Etiquetas', letterhead: 'Membrete' }
const ORIGIN_LABEL: Record<string, string> = {
  manual_labels: 'Manual · etiquetas', manual_letterhead: 'Manual · membrete', prisma_assistant: 'Asistente Prisma', prisma_supervised: 'Prisma supervisado',
}
const ACTOR_SOURCE_LABEL: Record<string, string> = {
  job_requester: 'Quien pidió el trabajo', logged_in_user: 'Usuario logueado en la estación', unknown: 'No identificado',
}
const PERIODS: Record<string, { label: string; ms: number }> = {
  '24h': { label: 'Últimas 24 h', ms: 86_400_000 }, '7d': { label: 'Últimos 7 días', ms: 7 * 86_400_000 },
  '30d': { label: 'Últimos 30 días', ms: 30 * 86_400_000 }, '90d': { label: 'Últimos 90 días', ms: 90 * 86_400_000 },
  '365d': { label: 'Último año', ms: 365 * 86_400_000 },
}
const PAGE_SIZE = 50

interface Filters { period: string; kind: string; status: string; origin: string; search: string }
const DEFAULT_FILTERS: Filters = { period: '7d', kind: '', status: '', origin: '', search: '' }

function buildQuery(f: Filters, page: number) {
  const to = Date.now()
  return {
    from: new Date(to - (PERIODS[f.period]?.ms ?? PERIODS['7d'].ms)).toISOString(), to: new Date(to).toISOString(), page, pageSize: PAGE_SIZE,
    search: f.search.trim() || undefined, kinds: f.kind ? [f.kind] : undefined, statuses: f.status ? [f.status] : undefined, origins: f.origin ? [f.origin] : undefined,
  }
}

const shortTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'medium' })
const longTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeStyle: 'long' })
const fmt = (f: Intl.DateTimeFormat, iso?: string) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : f.format(d) }

const documentLabel = (item: PrintItem) => {
  const d = item.document ?? {}
  if (item.kind === 'letterhead') return d.number ? `Membrete ${d.number}` : 'Membrete'
  if (d.batch_code) return `Lote ${d.batch_code}`
  return d.document_number ? `Req. ${d.document_number}` : (d.items?.[0]?.code ?? 'Etiquetas')
}

// El usuario logueado vive en localStorage de la PWA; Electron no lo conoce hasta que se le informa.
function roleOf(user: Record<string, unknown>): string | undefined {
  const role = user.role as unknown
  if (typeof role === 'string') return role
  if (role && typeof role === 'object' && typeof (role as { name?: unknown }).name === 'string') return (role as { name: string }).name
  const roles = user.roles as unknown
  if (Array.isArray(roles) && roles.length) { const first = roles[0]; return typeof first === 'string' ? first : (first as { name?: string })?.name }
  return undefined
}
function readActor() {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return null
    const user = JSON.parse(raw) as Record<string, unknown>
    const id = user.id as string | number | undefined
    const name = typeof user.name === 'string' ? user.name : undefined
    if ((id === undefined || id === null) && !name) return null
    return { id, name, role: roleOf(user) } // nunca correo ni token
  } catch { return null }
}

function subscribeApi(onChange: () => void) {
  window.addEventListener('focus', onChange)
  return () => window.removeEventListener('focus', onChange)
}
const hasApi = () => typeof window !== 'undefined' && Boolean(window.ivoolvePrintHistory)

export default function PrintHistory() {
  const available = useSyncExternalStore(subscribeApi, hasApi, () => false)
  const dialog = useRef<HTMLDialogElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [info, setInfo] = useState<HistoryInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<PrintItem | null>(null)
  const [copied, setCopied] = useState(false)

  // Informa a Electron quién está logueado (para atribuir cada impresión). Solo cuando cambia.
  useEffect(() => {
    if (!available) return
    let last = '__init__'
    const sync = () => {
      const actor = readActor()
      const key = JSON.stringify(actor)
      if (key === last) return
      last = key
      window.ivoolvePrintHistory?.setActor(actor).catch(() => { last = '__retry__' })
    }
    sync()
    const interval = setInterval(sync, 3000) // el login ocurre sin recargar: no hay evento `storage` en la misma pestaña
    window.addEventListener('focus', sync); window.addEventListener('storage', sync)
    return () => { clearInterval(interval); window.removeEventListener('focus', sync); window.removeEventListener('storage', sync) }
  }, [available])

  const load = useCallback(async (nextPage: number, nextFilters: Filters) => {
    const api = window.ivoolvePrintHistory
    if (!api) return
    const id = ++requestId.current
    setLoading(true); setError('')
    try {
      const response = await api.query(buildQuery(nextFilters, nextPage))
      if (id !== requestId.current) return
      if (!response?.ok) { setError(response?.error || 'No fue posible leer el historial de impresión.'); setResult(null) }
      else { setResult(response); setPage(response.page) }
    } catch {
      if (id === requestId.current) { setError('No fue posible leer el historial. Reinicia Ivoolve Print actualizado.'); setResult(null) }
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  const loadInfo = useCallback(async () => {
    try { setInfo(await window.ivoolvePrintHistory?.info() ?? null) } catch { setInfo(null) }
  }, [])

  function openViewer() {
    setNotice(''); setSelected(null)
    if (!dialog.current?.open) dialog.current?.showModal()
    void load(1, filters); void loadInfo()
  }

  function changeFilter(patch: Partial<Filters>, delay = 0) {
    const next = { ...filters, ...patch }
    setFilters(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void load(1, next) }, delay)
  }

  async function exportHistory(format: 'jsonl' | 'csv') {
    setNotice('')
    try {
      const response = await window.ivoolvePrintHistory?.export({ format, query: buildQuery(filters, 1) })
      if (!response?.ok) setNotice(response?.error || 'No fue posible exportar el historial.')
      else if (response.cancelled) setNotice('Exportación cancelada.')
      else setNotice(`Se exportaron ${response.count ?? 0} impresiones${response.truncated ? ' (límite de exportación alcanzado)' : ''}.`)
    } catch { setNotice('No fue posible exportar el historial.') }
  }

  async function copyText(value: string) {
    try { await navigator.clipboard.writeText(value) } catch {
      const area = document.createElement('textarea')
      area.value = value; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0'
      document.body.appendChild(area); area.select()
      try { document.execCommand('copy') } catch { /* sin portapapeles */ }
      area.remove()
    }
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  if (!available) return null

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)
  const select = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-pink-500'
  const summary = result?.summary

  return (
    <>
      <button
        type="button" onClick={openViewer} title="Ver historial de impresiones" aria-label="Ver historial de impresiones"
        className="fixed right-[8.25rem] top-4 z-[60] flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-md transition hover:border-pink-300 hover:text-pink-600 focus-visible:outline-2 focus-visible:outline-pink-500 sm:right-[18.25rem]"
      >
        <FiClipboard size={20} aria-hidden="true" />
        <span className="hidden sm:inline">Historial</span>
      </button>

      <dialog
        ref={dialog} aria-labelledby="print-history-title"
        onCancel={(e) => { if (selected) { e.preventDefault(); setSelected(null) } }}
        className="fixed inset-0 m-auto h-[90vh] w-[calc(100%-1rem)] max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-700 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="relative flex h-full flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-5">
            <div>
              <h2 id="print-history-title" className="text-lg font-semibold text-slate-900">Historial de impresiones</h2>
              <p className="text-xs text-slate-500">Quién mandó a imprimir y qué. «Enviado» significa que Windows aceptó el trabajo; no confirma que el papel haya salido.</p>
            </div>
            <button type="button" aria-label="Cerrar historial" onClick={() => dialog.current?.close()} className="rounded-lg p-2 hover:bg-slate-100"><FiX size={20} /></button>
          </header>

          <section aria-label="Filtros" className="grid grid-cols-2 gap-2 border-b border-slate-200 px-4 py-3 sm:px-5 md:grid-cols-6">
            <select aria-label="Periodo" className={select} value={filters.period} onChange={(e) => changeFilter({ period: e.target.value })}>
              {Object.entries(PERIODS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
            </select>
            <select aria-label="Tipo" className={select} value={filters.kind} onChange={(e) => changeFilter({ kind: e.target.value })}>
              <option value="">Todo tipo</option>
              {Object.entries(KIND_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select aria-label="Estado" className={select} value={filters.status} onChange={(e) => changeFilter({ status: e.target.value })}>
              <option value="">Todo estado</option>
              {(Object.keys(STATUS_LABEL) as Status[]).map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
            </select>
            <select aria-label="Origen" className={select} value={filters.origin} onChange={(e) => changeFilter({ origin: e.target.value })}>
              <option value="">Todo origen</option>
              {Object.entries(ORIGIN_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <input
              type="search" aria-label="Buscar en el historial" placeholder="Persona, lote, documento o código" value={filters.search} maxLength={100}
              onChange={(e) => changeFilter({ search: e.target.value }, 350)} className={`${select} col-span-2`}
            />
          </section>

          <section aria-label="Acciones" className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2 sm:px-5">
            <button type="button" onClick={() => { void load(page, filters); void loadInfo() }} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-pink-300 hover:text-pink-600 disabled:opacity-60">
              <FiRefreshCw size={14} aria-hidden="true" className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
            <button type="button" onClick={() => void exportHistory('csv')} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-pink-300 hover:text-pink-600"><FiDownload size={14} aria-hidden="true" /> CSV</button>
            <button type="button" onClick={() => void exportHistory('jsonl')} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-pink-300 hover:text-pink-600"><FiDownload size={14} aria-hidden="true" /> JSONL</button>
            {hasFilters && <button type="button" onClick={() => changeFilter(DEFAULT_FILTERS)} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 underline hover:text-pink-600">Limpiar filtros</button>}
            {summary && result && result.total > 0 && (
              <p className="ml-auto text-xs text-slate-600">
                {(Object.keys(STATUS_LABEL) as Status[]).filter((s) => summary.by_status[s]).map((s) => `${STATUS_LABEL[s]}: ${summary.by_status[s]}`).join(' · ')}
                {summary.total_quantity ? ` · ${summary.total_quantity} unidades enviadas` : ''}
              </p>
            )}
            <p role="status" className="w-full text-xs text-slate-500">{notice}</p>
          </section>

          <div className="min-h-0 flex-1 overflow-auto">
            {error ? (
              <p role="alert" className="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            ) : !result ? (
              <p className="m-5 text-sm text-slate-500">{loading ? 'Cargando historial…' : 'Sin datos todavía.'}</p>
            ) : result.items.length === 0 ? (
              <p className="m-5 text-sm text-slate-500">No hay impresiones con estos filtros en el periodo elegido.</p>
            ) : (
              <table className="w-full min-w-[42rem] table-fixed border-collapse text-left text-sm">
                <caption className="sr-only">Impresiones, de la más reciente a la más antigua</caption>
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="w-36 px-3 py-2 sm:w-40">Fecha y hora</th>
                    <th scope="col" className="w-40 px-3 py-2">Quién</th>
                    <th scope="col" className="w-24 px-3 py-2">Tipo</th>
                    <th scope="col" className="px-3 py-2">Documento / lote</th>
                    <th scope="col" className="hidden w-40 px-3 py-2 md:table-cell">Origen</th>
                    <th scope="col" className="w-16 px-3 py-2 text-right">Cant.</th>
                    <th scope="col" className="w-28 px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr
                      key={item.attempt_id} tabIndex={0} onClick={() => setSelected(item)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(item) } }}
                      aria-label={`${STATUS_LABEL[item.status]}: ${KIND_LABEL[item.kind] ?? item.kind} ${documentLabel(item)}`}
                      className="cursor-pointer border-t border-slate-100 hover:bg-pink-50/50 focus-visible:bg-pink-50 focus-visible:outline-2 focus-visible:outline-pink-500"
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{fmt(shortTime, item.requested_at)}</td>
                      <td className="truncate px-3 py-2" title={item.actor?.name}>
                        {item.actor?.name ?? (item.actor?.id ? `Usuario ${item.actor.id}` : <span className="text-slate-400">No identificado</span>)}
                      </td>
                      <td className="px-3 py-2">{KIND_LABEL[item.kind] ?? item.kind}</td>
                      <td className="truncate px-3 py-2" title={documentLabel(item)}>{documentLabel(item)}</td>
                      <td className="hidden truncate px-3 py-2 md:table-cell">{ORIGIN_LABEL[item.origin] ?? item.origin}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{item.document?.total_quantity ?? '—'}</td>
                      <td className="px-3 py-2"><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <footer className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-2 text-xs text-slate-500 sm:px-5">
            <button type="button" disabled={loading || page <= 1} onClick={() => void load(page - 1, filters)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-40">Anterior</button>
            <span>Página {page}{result ? ` · ${result.total} impresiones` : ''}</span>
            <button type="button" disabled={loading || !result?.hasMore} onClick={() => void load(page + 1, filters)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-40">Siguiente</button>
            <span className="ml-auto">
              {result?.truncated ? 'Lectura parcial: acota el periodo. ' : ''}
              {result && result.corrupt > 0 ? `${result.corrupt} líneas ilegibles omitidas. ` : ''}
              {info?.ok ? `${info.files ?? 0} archivos · ${((info.bytes ?? 0) / 1048576).toFixed(1)} MB · retención ${info.retentionDays ?? '—'} d${info.dropped ? ` · ${info.dropped} sin guardar` : ''}` : ''}
            </span>
          </footer>

          {selected && (
            <aside aria-label="Detalle de la impresión" className="absolute inset-y-0 right-0 z-10 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <h3 className="text-base font-semibold text-slate-900">Detalle de la impresión</h3>
                <button type="button" aria-label="Cerrar detalle" onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-slate-100"><FiX size={18} /></button>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3 text-sm">
                <p><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[selected.status]}`}>{STATUS_LABEL[selected.status]}</span> <span className="font-medium">{KIND_LABEL[selected.kind]} · {documentLabel(selected)}</span></p>
                {selected.reason && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5"><span className="font-semibold">Motivo: </span>{selected.reason}</p>}
                <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-slate-500">Quién</dt>
                  <dd>{selected.actor?.name ?? 'No identificado'}{selected.actor?.id ? ` (ID ${selected.actor.id})` : ''}{selected.actor?.role ? ` · ${selected.actor.role}` : ''}</dd>
                  <dt className="text-slate-500">Atribución</dt><dd>{ACTOR_SOURCE_LABEL[selected.actor?.source ?? 'unknown']}</dd>
                  <dt className="text-slate-500">Solicitado</dt><dd>{fmt(longTime, selected.requested_at)}</dd>
                  <dt className="text-slate-500">Finalizado</dt><dd>{fmt(longTime, selected.finished_at)}{selected.duration_ms !== undefined ? ` · ${selected.duration_ms} ms` : ''}</dd>
                  <dt className="text-slate-500">Origen</dt><dd>{ORIGIN_LABEL[selected.origin] ?? selected.origin}</dd>
                  {selected.job_id !== undefined && (<><dt className="text-slate-500">Trabajo Prisma</dt><dd>#{selected.job_id}{selected.job_source ? ` · ${selected.job_source}` : ''}</dd></>)}
                  {selected.silent !== undefined && (<><dt className="text-slate-500">Sin diálogo</dt><dd>{selected.silent ? 'Sí (confirmado en la PWA)' : 'No (con diálogo de Windows)'}</dd></>)}
                  {selected.document?.batch_code && (<><dt className="text-slate-500">Lote</dt><dd>{selected.document.batch_code}</dd></>)}
                  {selected.document?.abbreviation && (<><dt className="text-slate-500">Abreviatura</dt><dd>{selected.document.abbreviation}</dd></>)}
                  {selected.document?.number && (<><dt className="text-slate-500">Membrete / despacho</dt><dd>{selected.document.number}{selected.document.dispatch_id ? ` (ID ${selected.document.dispatch_id})` : ''}</dd></>)}
                  {selected.document?.document_number && (<><dt className="text-slate-500">Requisición</dt><dd>{selected.document.document_number}</dd></>)}
                  {selected.document?.production_order_id && (<><dt className="text-slate-500">Orden de producción</dt><dd>{selected.document.production_order_id}</dd></>)}
                  <dt className="text-slate-500">Cantidad total</dt><dd>{selected.document?.total_quantity ?? '—'}</dd>
                  {selected.result?.pages !== undefined && (<><dt className="text-slate-500">Páginas</dt><dd>{selected.result.pages}{selected.result.scaled ? ' (ajustado al papel)' : ''}</dd></>)}
                  {selected.station_id && (<><dt className="text-slate-500">Estación</dt><dd className="break-all font-mono">{selected.station_id}</dd></>)}
                  <dt className="text-slate-500">ID del intento</dt><dd className="break-all font-mono">{selected.attempt_id}</dd>
                  {selected.correlation_id && (
                    <>
                      <dt className="text-slate-500">Correlación</dt>
                      <dd className="flex items-start gap-2">
                        <span className="break-all font-mono">{selected.correlation_id}</span>
                        <button type="button" onClick={() => void copyText(selected.correlation_id as string)} className="flex shrink-0 items-center gap-1 rounded-md border border-slate-300 px-1.5 py-0.5 hover:border-pink-300 hover:text-pink-600" aria-label="Copiar correlation_id">
                          <FiCopy size={12} aria-hidden="true" /> {copied ? 'Copiado' : 'Copiar'}
                        </button>
                      </dd>
                    </>
                  )}
                </dl>
                {selected.document?.items && selected.document.items.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Detalle de etiquetas</h4>
                    <table className="w-full table-fixed text-xs">
                      <thead className="text-left text-slate-500"><tr><th className="w-20 py-1">Código</th><th className="py-1">Producto</th><th className="w-14 py-1">Var.</th><th className="w-12 py-1 text-right">Cant.</th></tr></thead>
                      <tbody>
                        {selected.document.items.map((row, index) => (
                          <tr key={index} className="border-t border-slate-100">
                            <td className="truncate py-1 font-mono" title={row.code}>{row.code}</td><td className="truncate py-1" title={row.title}>{row.title}</td>
                            <td className="truncate py-1">{row.variant}</td><td className="py-1 text-right tabular-nums">{row.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {selected.document.items_truncated ? <p className="mt-1 text-xs text-slate-500">+{selected.document.items_truncated} filas más no mostradas (el total sí las incluye).</p> : null}
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
