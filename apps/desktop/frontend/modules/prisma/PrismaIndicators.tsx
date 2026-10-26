'use client'

import {useEffect, useState} from 'react'
import {prismaService, type PrismaSignal} from './prisma.service'

export type PrismaLookupFeedback = {
  status: 'found' | 'not_found' | 'choose' | 'error'
  query: string
  code?: string
  title?: string
  variant?: string
  source?: string
  at?: number
}

const LABELS = [
  {kind: 'connection', name: 'Conexión'},
  {kind: 'labels', name: 'Etiqueta'},
  {kind: 'letterhead', name: 'Membrete'},
  {kind: 'channel', name: 'Canal'},
] as const

export default function PrismaIndicators({token, manualResult}: {token?: string; manualResult?: PrismaLookupFeedback | null}) {
  const [connected, setConnected] = useState(false)
  const [flashes, setFlashes] = useState<Partial<Record<PrismaSignal['kind'], {at: number; source: string}>>>({})
  const [now, setNow] = useState(Date.now())
  const [lookupResult, setLookupResult] = useState<PrismaLookupFeedback | null>(null)
  const [simulation, setSimulation] = useState<{kind: string; number: string; source: string; at: number} | null>(null)
  const [message, setMessage] = useState('Electron sin conectar')

  useEffect(() => {
    let active = true
    let polling = false
    setConnected(false)
    setFlashes({})
    setSimulation(null)
    setLookupResult(null)
    if (!token || !window.ivoolvePrisma?.poll) {
      setMessage(!token ? 'Inicia sesión para conectar la estación' : 'Abre la aplicación Electron actualizada')
      return
    }
    const tick = async () => {
      if (!active || polling) return
      polling = true
      try {
        const result = await prismaService.poll(token)
        if (!active) return
        if (!result.ok || result.connected !== true || !Array.isArray(result.signals)) throw Error(result.error || 'Sin conexión')
        setConnected(true)
        setMessage('Comunicación con Laravel confirmada')
        if (result.signals.length > 0) {
          const receiptIds = result.signals.map(s => s.receipt_id)
          // Never report simulation completed before Electron's authenticated ack.
          const ack = await prismaService.acknowledge(token, receiptIds)
          if (!active) return
          if (!ack.ok || ack.acknowledged !== receiptIds.length) throw Error('Señal recibida, pero sin acuse completo')
          const at = Date.now()
          const reports = result.signals.filter(s => s.lookup_status)
          if (reports.length) {
            const last = reports[reports.length - 1]
            setLookupResult({
              status: last.lookup_status!,
              query: last.document_query || (last.document_number ? 'Etiqueta ' + last.document_number : 'Etiqueta'),
              code: last.document_number || undefined,
              title: last.document_title || undefined,
              variant: last.document_variant || undefined,
              source: last.source,
              at,
            })
          }
          const simulations = result.signals.filter(s => s.document_number && !s.lookup_status && ['labels', 'letterhead'].includes(s.kind))
          if (simulations.length) {
            const last = simulations[simulations.length - 1]
            setSimulation({kind: last.kind, number: last.document_number!, source: last.source, at})
          }
          setFlashes(prev => {
            const next = {...prev}
            for (const signal of result.signals!) {
              if (signal.kind !== 'lookup') next[signal.kind] = {at, source: signal.source}
            }
            return next
          })
        }
      } catch (e) {
        if (active) {setConnected(false); setMessage(e instanceof Error ? e.message : 'No fue posible comprobar la estación')}
      } finally {polling = false}
    }
    void tick()
    const interval = setInterval(() => {setNow(Date.now()); void tick()}, 3500)
    return () => {active = false; clearInterval(interval)}
  }, [token])

  const notice = manualResult && (!lookupResult?.at || (manualResult.at || 0) >= lookupResult.at) ? manualResult : lookupResult
  const noticeIsMembrete = (notice?.query || '').toLowerCase().startsWith('membrete ')
  const noticeColor = notice?.status === 'found'
    ? 'border-green-200 bg-green-50 text-green-900'
    : notice?.status === 'not_found' || notice?.status === 'error'
      ? 'border-red-200 bg-red-50 text-red-800'
      : 'border-amber-200 bg-amber-50 text-amber-900'
  const noticeMessage = notice?.status === 'found'
    ? `${notice.title || notice.query} conseguido. ${notice.variant ? 'Variante: ' + notice.variant + '. ' : ''}Código: ${notice.code || 'no identificado'}.`
    : notice?.status === 'not_found'
      ? `${notice.query} no fue conseguido. ${notice.code ? 'Código solicitado: ' + notice.code : 'Código no identificado'}.`
      : notice?.status === 'choose'
        ? `Hay varias coincidencias para ${notice.query}. Especifica la variante o el código.`
        : `No fue posible consultar ${notice?.query || 'la etiqueta'}.`

  return <section aria-label="Diagnóstico Prisma" className="mx-auto mb-5 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-bold text-slate-800">Prisma · Test de conectividad</h2>
      <span className="text-[11px] text-slate-500">{message}</span>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {LABELS.map(item => {
        const light = item.kind === 'connection' ? connected : !!flashes[item.kind] && now - flashes[item.kind]!.at < 18000
        return <div key={item.kind} className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2 py-3 text-center">
          <span aria-label={`${item.name}: ${light ? 'activo' : 'inactivo'}`}
            className={`h-7 w-7 rounded-full border-2 shadow-inner transition-all duration-200 ${light
              ? 'border-green-300 bg-green-500 shadow-green-300 ring-4 ring-green-100'
              : 'border-slate-300 bg-slate-300'}`}/>
          <p className="text-xs font-semibold text-slate-700">{item.name}</p>
          <p className="min-h-4 text-[10px] text-slate-500">{item.kind === 'connection'
            ? connected ? 'API conectada' : 'Sin enlace'
            : light ? `Recibido: ${flashes[item.kind]!.source}` : 'Esperando prueba'}</p>
        </div>
      })}
    </div>
    {notice && <div role="status" aria-live="polite" className={`mt-3 rounded-xl border px-4 py-3 text-sm ${noticeColor}`}>
      <strong>{notice.status === 'found' ? (noticeIsMembrete ? 'Membrete encontrado' : 'Etiqueta encontrada') : notice.status === 'not_found' ? (noticeIsMembrete ? 'Membrete no encontrado' : 'Etiqueta no encontrada') : notice.status === 'choose' ? 'Selección necesaria' : 'Error de consulta'}:</strong>{' '}
      {noticeMessage}
      <span className="ml-2 text-xs">Origen: {notice.source || 'manual'}. La consulta y la simulación no imprimen.</span>
    </div>}
    {simulation && <div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <strong>{'Simulación de conectividad confirmada'}:</strong>{' '}
      {simulation.kind === 'letterhead' ? 'Membrete' : 'Etiqueta'} {simulation.number}
      <span className="ml-2 text-xs">Origen: {simulation.source}. No se imprimió ningún documento. Documento previamente validado por Laravel.</span>
    </div>}
    <p className="mt-3 text-center text-[11px] text-slate-500">Prueba etiqueta · Prueba membrete · Prueba canal. Los indicadores no comprueban impresoras físicas ni generan trabajos de impresión.</p>
  </section>
}
