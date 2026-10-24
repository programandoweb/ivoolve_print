'use client'

import { useEffect, useRef, useState } from 'react'
import { FiMessageSquare, FiPrinter, FiSend, FiX } from 'react-icons/fi'
import { prismaService, type PrismaResult } from './prisma.service'

type Message = { role: 'user' | 'assistant'; text: string }
const greeting: Message = { role: 'assistant', text: 'Soy Prisma. Puedo imprimir etiquetas por código de barras y cantidad, o membretes por número de despacho de hoy. Ejemplo: «Imprime 3 etiquetas del código 123» o «Imprime el membrete 02».' }

export default function PrismaAssistant({ token }: { token?: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<Message[]>([greeting])
  const [busy, setBusy] = useState(false)
  const [agent, setAgent] = useState<PrismaResult['agent']>(undefined)
  const [agentError, setAgentError] = useState('')
  const [plan, setPlan] = useState<PrismaResult | null>(null)
  const [selection, setSelection] = useState<PrismaResult | null>(null)
  const history = useRef<string[]>([])
  const locked = useRef(false)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLElement>(null)
  const launcher = useRef<HTMLButtonElement>(null)
  const append = (message: string) => setMessages(previous => [...previous, { role: 'assistant' as const, text: message }].slice(-60))

  useEffect(() => { if (open) end.current?.scrollIntoView({ block: 'nearest' }) }, [messages, selection, plan, open])
  useEffect(() => { if (open && !busy) input.current?.focus() }, [open, busy])
  useEffect(() => {
    if (!open) return
    let mounted = true
    setAgent(undefined)
    setAgentError('')
    if (!token) { setAgentError('Inicia sesión para usar Prisma.'); return }
    prismaService.status(token).then(result => {
      if (!mounted) return
      if (!result.ok || !result.agent) { setAgentError(result.error || 'Prisma no está disponible.'); return }
      setAgent(result.agent)
    }).catch(() => { if (mounted) setAgentError('No fue posible consultar el estado de Prisma.'); })
    return () => { mounted = false }
  }, [open, token])
  // Session-only state: no prompts, tokens, tickets or history are persisted in browser storage.
  useEffect(() => {
    history.current = []; setPlan(null); setSelection(null); setMessages([greeting])
    if (window.ivoolvePrisma) void window.ivoolvePrisma.cancel().catch(() => {})
  }, [token])

  function showResult(result: PrismaResult) {
    if (result.results?.length) {
      append(result.results.map(job => `${job.ok ? '✓' : '✕'} ${job.kind === 'labels' ? `Etiqueta ${job.number} × ${job.quantity}` : `Membrete ${job.number}`}: ${job.message}`).join('\n'))
    }
    if (!result.ok) { setSelection(null); append(result.error || 'No fue posible completar la solicitud.'); return }
    if (result.status === 'choose') {
      setSelection(result)
      append(`Hay varias coincidencias para el membrete ${result.number}. Elige el despacho; los siguientes trabajos quedan en espera.`)
    } else {
      setSelection(null)
      append((result.message || 'Proceso finalizado.') + (result.status === 'stopped' && result.remaining ? ` Quedaron ${result.remaining} documentos sin enviar.` : ''))
    }
  }
  async function perform(action: () => Promise<void>) {
    if (locked.current) return
    locked.current = true; setBusy(true)
    try { await action() } catch (error) { append(error instanceof Error ? error.message : 'No fue posible contactar a Prisma. No se reintentó la impresión.') }
    finally { locked.current = false; setBusy(false) }
  }
  async function submit() {
    if (locked.current || !text.trim() || plan || selection || agent?.available === false) return
    const message = text.trim()
    setText(''); setMessages(previous => [...previous, { role: 'user' as const, text: message }].slice(-60))
    await perform(async () => {
      if (!token) throw Error('Inicia sesión para utilizar Prisma.')
      const result = await prismaService.interpret(token, message, history.current)
      if (!result.ok) throw Error(result.error || 'No fue posible interpretar la solicitud.')
      if (!result.commands?.length) {
        history.current = [...history.current, message].slice(-6)
        append(result.message || 'Indica el documento y su número.'); return
      }
      history.current = []
      if (result.requires_confirmation) { setPlan(result); append('Revisa los documentos y pulsa Imprimir para continuar.'); return }
      append('Preparando el documento con el perfil de esta estación…')
      showResult(await prismaService.execute(token, result, false))
    })
  }
  async function confirm() {
    if (!plan || !token) return
    const accepted = plan
    setPlan(null)
    await perform(async () => showResult(await prismaService.execute(token, accepted, true)))
  }
  async function choose(dispatchId: number) {
    if (!token) return
    setSelection(null)
    await perform(async () => showResult(await prismaService.choose(token, dispatchId)))
  }
  async function cancel() {
    setPlan(null); setSelection(null); history.current = []
    await perform(async () => showResult(await prismaService.cancel()))
  }
  function close() { setOpen(false); launcher.current?.focus() }

  return <>
    <div className="mx-auto mb-6 flex w-full max-w-xl justify-center">
      <button ref={launcher} type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-5 py-3 text-sm font-semibold text-pink-700 hover:bg-pink-100">
        <FiMessageSquare aria-hidden /> Prisma · Asistente de impresión
      </button>
    </div>
    {open && <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/40" onClick={event => { if (event.target === event.currentTarget && !busy) close() }}>
      <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="prisma-title" onKeyDown={event => {
        if (event.key === 'Escape' && !busy) close()
        if (event.key === 'Tab') {
          const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || [])
          const first = elements[0], last = elements[elements.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
      }} className="flex h-[100dvh] w-full max-w-lg flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div><h2 id="prisma-title" className="flex items-center gap-2 text-lg font-bold text-slate-900"><FiPrinter className="text-pink-600" /> Prisma</h2><p className="text-xs text-slate-500">Etiquetas y membretes · Perfiles de esta estación</p></div>
          <button type="button" onClick={close} aria-label="Cerrar Prisma" className="rounded-lg p-3 text-slate-600 hover:bg-slate-100"><FiX /></button>
        </header>
        <div aria-live="polite" className="border-b border-slate-200 px-5 py-2 text-xs text-slate-600">
          {agentError || (agent ? (agent.available ? `Disponible · ${agent.provider} / ${agent.model}` : agent.reason || 'Prisma desactivado o sin configurar.') : 'Consultando estado de Prisma…')}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-5">
          <div role="log" aria-live="polite" aria-busy={busy} className="space-y-4">
            {messages.map((message, index) => <div key={index} className={message.role === 'user' ? 'ml-8 rounded-2xl bg-pink-600 p-3 text-sm whitespace-pre-wrap break-words text-white' : 'mr-4 rounded-2xl border border-slate-200 bg-white p-3 text-sm whitespace-pre-wrap break-words text-slate-700'}>{message.text}</div>)}
            {busy && <p role="status" className="text-sm text-slate-500">Prisma está procesando la solicitud…</p>}
          </div>
          {plan && <div className="mt-4 rounded-xl border border-pink-200 bg-white p-4">
            <p className="mb-2 text-sm font-semibold text-slate-900">Documentos preparados</p>
            <ul className="space-y-2 text-sm text-slate-700">{plan.commands?.map((command, index) => <li key={index}>{command.kind === 'labels' ? `Etiqueta ${command.number} · ${command.quantity} copias` : `Membrete ${command.number} · hoy`}</li>)}</ul>
            <div className="mt-4 flex gap-2"><button type="button" disabled={busy} onClick={() => void confirm()} className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Imprimir</button><button type="button" disabled={busy} onClick={() => void cancel()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">Cancelar</button></div>
          </div>}
          {selection && <div className="mt-4 space-y-2">
            {selection.candidates?.map(candidate => <button key={candidate.id} type="button" disabled={busy} onClick={() => void choose(candidate.id)} className="block w-full rounded-xl border border-pink-200 bg-white p-3 text-left text-sm text-slate-800 hover:bg-pink-50">Despacho {candidate.number} · {candidate.kind}<span className="block text-xs text-slate-500">{candidate.name} · Registro #{candidate.id}</span></button>)}
            <button type="button" disabled={busy} onClick={() => void cancel()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">Cancelar pendientes</button>
          </div>}
          <div ref={end} />
        </div>
        <form onSubmit={event => { event.preventDefault(); void submit() }} className="border-t border-slate-200 p-4">
          <p className="mb-3 text-xs text-slate-500">La impresión silenciosa y las medidas se toman del perfil. Las solicitudes de texto se procesan con IA; no incluyas contraseñas.</p>
          <div className="flex gap-2"><input ref={input} aria-label="Mensaje para Prisma" value={text} onChange={event => setText(event.target.value)} disabled={busy || !!plan || !!selection || agent?.available === false} maxLength={1000} placeholder="Imprime el membrete 02" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 outline-none focus:border-pink-500 disabled:bg-slate-100" /><button type="submit" aria-label="Enviar a Prisma" disabled={busy || !text.trim() || !!plan || !!selection || agent?.available === false} className="rounded-xl bg-pink-600 px-4 text-white hover:bg-pink-700 disabled:opacity-40"><FiSend /></button></div>
        </form>
      </section>
    </div>}
  </>
}
