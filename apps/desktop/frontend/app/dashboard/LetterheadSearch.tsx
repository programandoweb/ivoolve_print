'use client'

import { useRef, useState } from 'react'
import { FiPrinter, FiSearch } from 'react-icons/fi'

type Candidate = { id: number; number: string; kind: string; name: string }
type Result = { ok: boolean; error?: string; status?: 'choose' | 'printed'; message?: string; date?: string; candidates?: Candidate[] }
declare global {
  interface Window {
    ivoolveDispatchPrint?: { run: (value: { number: string; token: string; dispatchId?: number }) => Promise<Result> }
  }
}

export default function LetterheadSearch({ token }: { token?: string }) {
  const [number, setNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const locked = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  async function submit(dispatchId?: number) {
    if (locked.current) return
    setMessage(''); setCandidates([])
    if (!/^[0-9]{1,6}$/.test(number.trim()) || Number(number) < 1) { setMessage('Escribe un número de despacho, por ejemplo 02.'); return }
    if (!window.ivoolveDispatchPrint?.run) { setMessage('Actualiza y abre Ivoolve Print en Electron para buscar e imprimir membretes.'); return }
    if (!token) { setMessage('Inicia sesión nuevamente para consultar los despachos.'); return }
    locked.current = true; setBusy(true)
    try {
      const result = await window.ivoolveDispatchPrint.run({ number: number.trim(), token, ...(dispatchId ? { dispatchId } : {}) })
      if (!result.ok) { setMessage(result.error || 'No fue posible imprimir el membrete.'); return }
      if (result.status === 'choose') {
        setCandidates(result.candidates || [])
        setMessage('Hay varios despachos con ese número hoy. Selecciona el que deseas imprimir.')
      } else { setMessage(result.message || 'Membrete enviado a impresión.') }
    } catch {
      setMessage('No se pudo completar la impresión. Actualiza Electron y revisa el perfil Membretes.')
    } finally {
      locked.current = false; setBusy(false); input.current?.focus(); input.current?.select()
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">Buscar despacho de hoy</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">Ingresa el número del listado de despachos y presiona Enter. Se utiliza la fecha actual de Colombia y el perfil configurado para Membretes.</p>
      </div>
      <form onSubmit={event => { event.preventDefault(); void submit() }} className="space-y-3">
        <label htmlFor="dispatch-number" className="block text-sm font-medium text-slate-700">Número de despacho</label>
        <div className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 focus-within:border-pink-500 focus-within:ring-2 focus-within:ring-pink-100">
          <FiSearch className="shrink-0 text-slate-400" aria-hidden="true" />
          <input ref={input} id="dispatch-number" autoFocus inputMode="numeric" pattern="[0-9]{1,6}" maxLength={6} value={number} onChange={event => { setNumber(event.target.value.replace(/\D/g, '')); setCandidates([]); setMessage('') }} disabled={busy} placeholder="Ej. 02" className="w-full bg-transparent py-4 text-lg text-slate-900 outline-none" autoComplete="off" />
        </div>
        <button type="submit" disabled={busy || !number.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-50"><FiPrinter aria-hidden="true" />{busy ? 'Buscando y preparando impresión…' : 'Buscar e imprimir'}</button>
      </form>
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">Impresión silenciosa activada en el perfil: envío directo. Desactivada: se abre el diálogo Windows. Un perfil inactivo bloquea el envío.</p>
      {message && <p role="status" aria-live="polite" className="rounded-xl border border-pink-100 bg-pink-50 px-3 py-3 text-sm leading-6 text-slate-700">{message}</p>}
      {candidates.length > 0 && <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">{candidates.map(candidate => <button key={candidate.id} type="button" disabled={busy} onClick={() => void submit(candidate.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:opacity-50"><span><strong className="text-sm text-slate-900">{candidate.number} · {candidate.kind}</strong><span className="mt-1 block text-xs text-slate-500">{candidate.name || 'Despacho #' + candidate.id}</span></span><FiPrinter className="shrink-0 text-pink-500" aria-hidden="true" /></button>)}</div>}
    </div>
  )
}
