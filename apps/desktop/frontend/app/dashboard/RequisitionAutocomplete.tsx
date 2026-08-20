'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FiRefreshCw, FiSearch } from 'react-icons/fi'
import {
  searchRequisitions,
  type RequisitionAutocompleteItem,
} from '@/lib/requisitionCache'

type Props = {
  value: string
  items: RequisitionAutocompleteItem[]
  syncing: boolean
  lastSync?: string | null
  onChange: (value: string) => void
  onSelect: (item: RequisitionAutocompleteItem) => void
  onRefresh: () => void
}

export default function RequisitionAutocomplete({
  value,
  items,
  syncing,
  lastSync,
  onChange,
  onSelect,
  onRefresh,
}: Props) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const matches = useMemo(() => searchRequisitions(items, value, 10), [items, value])
  const formattedLastSync = useMemo(() => {
    if (!lastSync) return null
    const date = new Date(lastSync)
    if (Number.isNaN(date.getTime())) return lastSync
    return date.toLocaleString('es-CO')
  }, [lastSync])

  useEffect(() => {
    setActiveIndex(0)
  }, [value])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectItem = (item: RequisitionAutocompleteItem) => {
    onSelect(item)
    setOpen(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || matches.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % matches.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + matches.length) % matches.length)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const selected = matches[activeIndex]
      if (selected) selectItem(selected)
    }
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="flex w-full gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-slate-300 bg-white px-4 shadow-sm transition focus-within:border-pink-500 focus-within:ring-2 focus-within:ring-pink-200">
          <FiSearch className="shrink-0 text-slate-400" size={20} />
          <input
            type="text"
            value={value}
            onChange={(event) => {
              onChange(event.target.value)
              setOpen(Boolean(event.target.value.trim()))
            }}
            onFocus={() => value.trim() && setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar requisición, producto o asignado..."
            autoComplete="off"
            className="w-full bg-transparent px-3 py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={syncing}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-60"
          title="Actualizar requisiciones desde el servidor"
        >
          <FiRefreshCw className={syncing ? 'animate-spin' : ''} size={17} />
          <span className="hidden sm:inline">{syncing ? 'Actualizando' : 'Actualizar'}</span>
        </button>
      </div>

      {formattedLastSync && (
        <div className="mt-1 px-2 text-[11px] text-slate-400">
          Cache local actualizado: {formattedLastSync}
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="grid grid-cols-[1.35fr_1.15fr_.55fr_.85fr] gap-3 bg-pink-500 px-4 py-2 text-xs font-semibold text-white">
            <div>Asignado por</div>
            <div>Producto</div>
            <div className="text-center">Cantidad</div>
            <div className="text-right">Fecha</div>
          </div>

          {matches.length > 0 ? (
            <div className="max-h-80 overflow-y-auto">
              {matches.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectItem(item)}
                  className={[
                    'grid w-full grid-cols-[1.35fr_1.15fr_.55fr_.85fr] gap-3 border-b border-slate-100 px-4 py-3 text-left text-xs transition last:border-b-0',
                    activeIndex === index
                      ? 'bg-pink-50'
                      : 'bg-white hover:bg-slate-50',
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{item.assignedBy}</div>
                    <div className="mt-0.5 truncate text-[10px] font-semibold text-pink-500">
                      {item.batchCode}
                    </div>
                  </div>
                  <div className="truncate font-medium text-slate-800">{item.product}</div>
                  <div className="text-center font-semibold text-slate-700">{item.quantity}</div>
                  <div className="text-right text-slate-600">{item.date}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-5 text-center text-sm text-slate-500">
              No hay coincidencias en el cache local.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
