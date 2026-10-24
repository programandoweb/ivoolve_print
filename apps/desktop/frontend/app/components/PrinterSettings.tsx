'use client'

import { useRef, useState } from 'react'
import { FiSettings, FiX } from 'react-icons/fi'

declare global {
  interface Window {
    ivoolvePrinterSettings?: { open: () => Promise<{ ok: boolean }> }
  }
}

export default function PrinterSettings() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [message, setMessage] = useState('')
  const [opening, setOpening] = useState(false)

  async function openSettings() {
    if (opening) return
    setOpening(true)
    try {
      if (window.ivoolvePrinterSettings?.open) {
        const result = await window.ivoolvePrinterSettings.open()
        if (result.ok) return
        setMessage('No se pudo abrir la configuración local. Reinicia la aplicación de escritorio actualizada.')
      } else {
        setMessage('Este navegador no permite consultar las impresoras instaladas en Windows. Abre esta misma aplicación desde Ivoolve Print de escritorio para configurar y vincular tus impresoras.')
      }
    } catch {
      setMessage('Actualiza y reinicia Ivoolve Print de escritorio para habilitar el acceso a la configuración local.')
    } finally {
      setOpening(false)
    }
    if (!dialog.current?.open) dialog.current?.showModal()
  }

  return (
    <>
      <button
        type="button"
        onClick={openSettings}
        disabled={opening}
        title="Configurar impresoras BETA"
        aria-label="Configurar impresoras BETA"
        className="fixed right-4 top-4 z-[60] flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-md transition hover:border-pink-300 hover:text-pink-600 focus-visible:outline-2 focus-visible:outline-pink-500 disabled:opacity-60"
      >
        <FiSettings size={20} aria-hidden="true" />
        <span className="hidden sm:inline">Impresoras BETA</span>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="printer-settings-title"
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="printer-settings-title" className="text-lg font-semibold text-slate-900">Configuración de impresoras BETA</h2>
          <button type="button" aria-label="Cerrar configuración" onClick={() => dialog.current?.close()} className="rounded-lg p-2 hover:bg-slate-100"><FiX size={20} /></button>
        </div>
        <p className="mt-4 text-sm leading-6" role="status">{message}</p>
        <p className="mt-3 text-sm leading-6">En escritorio: abre este engranaje, activa BETA y asigna los perfiles Etiquetas, Membretes o Despachos. En escritorio puedes activar o desactivar la impresión sin cuadro de diálogo.</p>
        <button type="button" onClick={() => dialog.current?.close()} className="mt-5 rounded-xl bg-pink-500 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-600">Entendido</button>
      </dialog>
    </>
  )
}
