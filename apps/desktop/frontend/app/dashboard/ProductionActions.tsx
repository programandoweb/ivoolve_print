'use client'

import { FiPrinter, FiX } from 'react-icons/fi'

interface ProductionActionsProps {
  value: string
  printing: boolean
  onChange: (value: string) => void
  onPrint: () => void
  onReset: () => void
}

export default function ProductionActions({
  value,
  printing,
  onChange,
  onPrint,
  onReset,
}: ProductionActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Abreviatura"
        className="h-11 w-[110px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-200"
      />

      <button
        type="button"
        onClick={onPrint}
        disabled={printing || !value.trim()}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <FiPrinter size={18} />
        {printing ? 'Imprimiendo...' : 'Imprimir'}
      </button>

      <button
        type="button"
        onClick={onReset}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500"
      >
        <FiX size={20} />
      </button>
    </div>
  )
}