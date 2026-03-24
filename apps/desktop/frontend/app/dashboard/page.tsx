'use client'

/**
 * ---------------------------------------------------
 * Desarrollado por: Jorge Méndez - Programandoweb
 * Proyecto: Ivoolve
 * ---------------------------------------------------
 */

import { useMemo, useState } from 'react'
import {
  FiSearch,
  FiX,
  FiPackage,
  FiHash,
  FiLayers,
  FiTag,
  FiBox,
  FiPrinter,
} from 'react-icons/fi'
import useFormData from '@/hooks/useFormData'
import LogoComponent from '../components/Logo'

declare global {
  interface Window {
    api?: {
      print: (data: any) => Promise<any>
    }
  }
}

export default function Page() {
  const formData = useFormData(false, false, false, true)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [data, setData] = useState<any>(null)
  const [print, setPrint] = useState<any>([])

  const totalQuantity = useMemo(() => {
    if (!data?.items?.length) return 0
    return data.items.reduce(
      (acc: number, item: any) => acc + Number(item.quantity || 0),
      0
    )
  }, [data])

  const totalReferences = useMemo(() => {
    return data?.items?.length || 0
  }, [data])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!search.trim()) return

    setLoading(true)

    try {
      const endpoint = formData.backend + location.pathname

      const response = await formData.handleRequest(
        endpoint + '/production-order',
        'post',
        {
          search: search.trim(),
        }
      )

      if (response?.order) {
        setData(response.order)
      }

      if (response?.print) {
        setPrint(response.print)
      }
      
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setData(null)
    setSearch('')
  }

  const handlePrint = async () => {
    try {
      if (!data?.id) return

      setPrinting(true)

      /*
      const labels = (data?.items || []).flatMap((item: any) => {
        const quantity = Number(item.quantity || 0)
        console.log(item)
        return Array.from({ length: quantity }, (_, index) => ({
          title: data?.product?.name || 'Sin nombre',
          code: `${item.code}`,
          variant: item.variant_name || '-',
        }))
      })
        */

      const payload = { print }

      console.log('Payload etiquetas:', payload)      

      if (typeof window === 'undefined' || !window.api?.print) {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: 'El puente de impresión no está disponible',
              type: 'error',
            },
          })
        )
        return
      }

      const result = await window.api.print(payload)
      console.log('Resultado impresión:', result)

      if (!result?.ok) {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: result?.message || 'Error enviando a impresión',
              type: 'error',
            },
          })
        )
        return
      }

      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: `Etiquetas del lote ${data?.batch_code} enviadas a impresión`,
            type: 'success',
          },
        })
      )
    } catch (error) {
      console.error(error)

      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: 'Error enviando la orden a impresión',
            type: 'error',
          },
        })
      )
    } finally {
      setPrinting(false)
    }
  }
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto mb-6 flex w-full max-w-[180px] items-center justify-center">
        <LogoComponent />
      </div>

      <h1 className="mb-8 text-center text-2xl font-bold text-slate-800">
        Lista de órdenes
      </h1>

      {!data && (
        <form onSubmit={handleSubmit} className="mx-auto mb-8 flex w-full max-w-xl">
          <div className="flex w-full items-center rounded-2xl border border-slate-300 bg-white px-4 shadow-sm transition focus-within:border-pink-500 focus-within:ring-2 focus-within:ring-pink-200">
            <FiSearch className="text-slate-400" size={20} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Escribe y presiona Enter para buscar"
              className="w-full bg-transparent px-3 py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>
        </form>
      )}

      {loading && (
        <p className="mb-6 text-center text-sm text-slate-500">
          Consultando órdenes...
        </p>
      )}

      {data && (
        <div className="mx-auto w-full max-w-5xl">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-6">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pink-100 text-pink-600">
                  <FiPackage size={28} />
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-slate-800">
                    {data?.product?.name || 'Orden encontrada'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Resumen general de la orden de producción
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={printing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <FiPrinter size={18} />
                  {printing ? 'Imprimiendo...' : 'Imprimir'}
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                >
                  <FiX size={20} />
                </button>
              </div>
            </div>

            <div className="grid gap-4 border-b border-slate-100 px-6 py-6 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-500">
                  <FiHash size={16} />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Lote
                  </span>
                </div>
                <p className="text-lg font-bold text-slate-800">
                  {data?.batch_code || '-'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-500">
                  <FiTag size={16} />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Estado
                  </span>
                </div>
                <p className="text-lg font-bold text-slate-800">
                  {data?.status || '-'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-500">
                  <FiLayers size={16} />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Tipo
                  </span>
                </div>
                <p className="text-lg font-bold capitalize text-slate-800">
                  {data?.production_type || '-'}
                </p>
              </div>

              <div className="rounded-2xl border border-pink-200 bg-pink-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-pink-500">
                  <FiBox size={16} />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Total unidades
                  </span>
                </div>
                <p className="text-2xl font-extrabold text-pink-600">
                  {totalQuantity}
                </p>
              </div>
            </div>

            <div className="grid gap-4 border-b border-slate-100 px-6 py-6 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-500">Producto</p>
                <p className="mt-2 text-lg font-bold text-slate-800">
                  {data?.product?.name || '-'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-500">
                  Total referencias
                </p>
                <p className="mt-2 text-lg font-bold text-slate-800">
                  {totalReferences}
                </p>
              </div>
            </div>

            <div className="px-6 py-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    Detalle de variantes
                  </h3>
                  <p className="text-sm text-slate-500">
                    Cantidades discriminadas por referencia
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                  <div className="col-span-8">Variante</div>
                  <div className="col-span-4 text-right">Cantidad</div>
                </div>

                <div className="divide-y divide-slate-100 bg-white">
                  {data?.items?.map((item: any) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 items-center px-4 py-3 transition hover:bg-slate-50"
                    >
                      <div className="col-span-8 pr-3 text-sm font-medium text-slate-700">
                        {item.variant_name}
                      </div>
                      <div className="col-span-4 text-right text-base font-bold text-slate-800">
                        {item.quantity}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-12 border-t border-slate-200 bg-pink-50 px-4 py-4">
                  <div className="col-span-8 text-sm font-bold uppercase tracking-wide text-pink-700">
                    Total general
                  </div>
                  <div className="col-span-4 text-right text-xl font-extrabold text-pink-700">
                    {totalQuantity}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}