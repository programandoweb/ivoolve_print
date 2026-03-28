'use client'

/**
 * ---------------------------------------------------
 * Desarrollado por: Jorge Méndez - Programandoweb
 * Proyecto: Ivoolve
 * ---------------------------------------------------
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { FiSearch } from 'react-icons/fi'
import { io, type Socket } from 'socket.io-client'
import useFormData from '@/hooks/useFormData'
import useUserHook from '@/hooks/useUserHook'
import LogoComponent from '../components/Logo'
import VariantsDetail from './VariantsDetail'
import ProductSummary from './ProductSummary'
import ProductionStats from './ProductionStats'
import ProductionHeader from './ProductionHeader'
import ProductionActions from './ProductionActions'

declare global {
  interface Window {
    api?: {
      print: (data: any) => Promise<any>
    }
  }
}

export default function Page() {
  const formData = useFormData(false, false, false, true)
  const { user } = useUserHook()
  const socketRef = useRef<Socket | null>(null)

  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [data, setData] = useState<any>(null)
  const [print, setPrint] = useState<any[]>([])
  const [printQuantity, setPrintQuantity] = useState('')

  const fetchProductionOrder = async (
    searchValue: string,
    options?: { resetPrintQuantity?: boolean }
  ) => {
    if (!searchValue.trim()) return null

    setLoading(true)

    try {
      const endpoint = formData.backend + location.pathname

      const response = await formData.handleRequest(
        endpoint + '/production-order',
        'post',
        {
          search: searchValue.trim(),
        }
      )

      if (response?.order) {
        setData(response.order)
      }

      if (response?.print) {
        setPrint(response.print)
      }

      if (options?.resetPrintQuantity !== false) {
        setPrintQuantity('')
      }

      return response
    } catch (error) {
      console.error(error)
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user?.token || !process.env.NEXT_PUBLIC_SOCKET_URL_PRINT) return

    const socket = io(`${process.env.NEXT_PUBLIC_SOCKET_URL_PRINT}/printer`, {
      transports: ['websocket'],
      auth: {
        token: user.token,
        userName: user.name,
        role: user.role,
      },
    })

    socketRef.current = socket

    const handleConnect = () => {
      console.log('RECEPTOR conectado:', socket.id)
    }

    const handleConnectError = (error: Error) => {
      console.log('Error de conexión socket:', error)
    }

    const handlePrinterConnected = (response: unknown) => {
      console.log('printer:connected =>', response)
    }

    const handlePrinterResponse = (response: any) => {
      console.log('printer:response =>', response)
    }

    const handlePrinterAck = (response: unknown) => {
      console.log('printer:ack =>', response)

      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: 'Trabajo recibido por el servicio de impresión',
            type: 'success',
          },
        })
      )
    }

    const handlePrinterJob = async (socketData: any) => {
      const batchCode = socketData?.payload?.batch_code
      const abbreviation = socketData?.payload?.abbreviation

      console.log('printer:job =>', batchCode, abbreviation)

      if (!batchCode) return

      setSearch(String(batchCode))
      setPrintQuantity(abbreviation || '')
      await fetchProductionOrder(String(batchCode), { resetPrintQuantity: false })
    }

    socket.on('connect', handleConnect)
    socket.on('connect_error', handleConnectError)
    socket.on('printer:connected', handlePrinterConnected)
    socket.on('printer:response', handlePrinterResponse)
    socket.on('printer:ack', handlePrinterAck)
    socket.on('printer:job', handlePrinterJob)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('connect_error', handleConnectError)
      socket.off('printer:connected', handlePrinterConnected)
      socket.off('printer:response', handlePrinterResponse)
      socket.off('printer:ack', handlePrinterAck)
      socket.off('printer:job', handlePrinterJob)
      socket.disconnect()
      socketRef.current = null
    }
  }, [user])

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
    await fetchProductionOrder(search, { resetPrintQuantity: true })
  }

  const handleReset = () => {
    setData(null)
    setPrint([])
    setSearch('')
    setPrintQuantity('')
  }

  const handlePrintQuantityChange = (value: string) => {
    setPrintQuantity(value)
  }

  const handlePrint = async () => {
  try {
    
    if (!data?.id || !print?.length) return

    const abbreviation = printQuantity.trim()

    if (!abbreviation) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: 'Debes ingresar una abreviatura válida',
            type: 'error',
          },
        })
      )
      return
    }

    setPrinting(true)

    console.log(abbreviation,"abbreviation----")

    const payload = {
      print: print.map((item: any) => ({
        title: item.title || data?.product?.name || 'Sin nombre',
        code: `${item.code || ''} - ${abbreviation}`,
        variant_name: item.variant_name || item.variant || '-',
        quantity: Number(item.quantity || 0),
        abbreviation:abbreviation
      })),
      abbreviation,
      batch_code:
        typeof data?.batch_code === 'string'
          ? data.batch_code.replace('LOT-', '')
          : data?.batch_code,
    }

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
    <div className="px-4 py-10">
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
              <ProductionHeader productName={data?.product?.name} />
              <ProductionActions
                value={printQuantity}
                printing={printing}
                onChange={handlePrintQuantityChange}
                onPrint={handlePrint}
                onReset={handleReset}
              />
            </div>

            <ProductionStats
              batchCode={data?.batch_code}
              status={data?.status}
              productionType={data?.production_type}
              totalQuantity={totalQuantity}
            />

            <ProductSummary
              productName={data?.product?.name}
              totalReferences={totalReferences}
            />

            <VariantsDetail
              items={data?.items || []}
              totalQuantity={totalQuantity}
            />
          </div>
        </div>
      )}
    </div>
  )
}