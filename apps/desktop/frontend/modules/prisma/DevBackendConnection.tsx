'use client'

import {useEffect, useState} from 'react'
import PrismaIndicators from './PrismaIndicators'

// El backend de desarrollo es una sesión aparte: su token solo se envía a dev
// (Electron enruta por la clave 'dev', nunca por URL).
const DEV_API = (process.env.NEXT_PUBLIC_BACKEND_URL_DEV || 'https://dev.backend.delicetiendavirtual.com') + '/api/v1/'
const KEY = 'ivoolve_dev_session'

type DevSession = {token: string; email: string}

function readSession(): DevSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null')
    return value && typeof value.token === 'string' ? value : null
  } catch {return null}
}

export default function DevBackendConnection() {
  const [session, setSession] = useState<DevSession | null>(null)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {setSession(readSession())}, [])

  const login = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true); setError('')
    try {
      const response = await fetch(DEV_API + 'auth', {
        method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify({email, password, remember: false}),
      })
      const json = await response.json().catch(() => null)
      const token = json?.token ?? json?.data?.token
      if (!response.ok || typeof token !== 'string') throw Error('No fue posible iniciar sesión en desarrollo.')
      const next = {token, email}
      localStorage.setItem(KEY, JSON.stringify(next))
      setSession(next); setOpen(false); setPassword('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible iniciar sesión en desarrollo.')
    } finally {setLoading(false)}
  }
  const logout = () => {localStorage.removeItem(KEY); setSession(null)}

  if (session) {
    return <>
      <PrismaIndicators token={session.token} backend="dev" />
      <p className="mx-auto -mt-3 mb-5 w-full max-w-3xl text-right text-[11px] text-slate-500">
        Desarrollo: {session.email} · <button type="button" onClick={logout} className="underline">Desconectar</button>
      </p>
    </>
  }
  return <section aria-label="Backend de desarrollo" className="mx-auto mb-5 w-full max-w-3xl rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm">
    {!open
      ? <button type="button" onClick={() => setOpen(true)} className="font-semibold text-slate-700 underline">Conectar backend de desarrollo</button>
      : <form onSubmit={login} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-slate-600">Correo
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" className="rounded-lg border border-slate-300 px-2 py-1 text-sm"/>
        </label>
        <label className="flex flex-col text-xs text-slate-600">Contraseña
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" className="rounded-lg border border-slate-300 px-2 py-1 text-sm"/>
        </label>
        <button type="submit" disabled={loading} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Conectando…' : 'Conectar'}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 underline">Cancelar</button>
        {error && <p role="alert" className="w-full text-xs text-red-700">{error}</p>}
      </form>}
  </section>
}
