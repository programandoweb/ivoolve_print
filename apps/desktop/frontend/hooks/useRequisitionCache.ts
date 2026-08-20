'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  flattenRequisitionOrders,
  readRequisitionSnapshot,
  type RequisitionAutocompleteItem,
  type RequisitionSnapshot,
  writeRequisitionSnapshot,
} from '@/lib/requisitionCache'

const POLLING_INTERVAL_MS = 5 * 60 * 1000

type Options = {
  backend: string
  token?: string | null
  userKey?: string | number | null
}

export default function useRequisitionCache({ backend, token, userKey }: Options) {
  const [snapshot, setSnapshot] = useState<RequisitionSnapshot | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const syncingRef = useRef(false)

  const loadLocalSnapshot = useCallback(async () => {
    if (!userKey) return

    try {
      const cached = await readRequisitionSnapshot(userKey)
      if (cached) setSnapshot(cached)
    } catch (error) {
      console.error('No fue posible leer el cache de requisiciones:', error)
    }
  }, [userKey])

  const sync = useCallback(
    async (showToast = false) => {
      if (!token || !userKey || syncingRef.current) return false

      syncingRef.current = true
      setSyncing(true)
      setLastError(null)

      try {
        // 1) Ejecuta primero la rutina masiva existente de códigos de barras.
        // Se dispara en inicio, polling, reconexión y actualización manual porque
        // todos esos flujos reutilizan esta misma función sync().
        const barcodeResponse = await fetch(`${backend}/generated_barcode`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        })

        if (!barcodeResponse.ok) {
          throw new Error(
            `No fue posible ejecutar la generación masiva de códigos (HTTP ${barcodeResponse.status})`
          )
        }

        // 2) Una vez terminada la generación masiva, refresca el snapshot local.
        const response = await fetch(
          `${backend}/dashboard/production-order/requisition-snapshot`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${token}`,
            },
            cache: 'no-store',
          }
        )

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const payload = await response.json()
        const data = payload?.data as RequisitionSnapshot | undefined

        if (!data || !Array.isArray(data.orders)) {
          throw new Error('El backend devolvió un snapshot inválido')
        }

        // Se persiste exactamente el payload data devuelto por el endpoint.
        await writeRequisitionSnapshot(userKey, data)
        setSnapshot(data)

        if (showToast) {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: {
                message: `${data.orders.length} requisiciones actualizadas`,
                type: 'success',
              },
            })
          )
        }

        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error de sincronización'
        setLastError(message)
        console.error('No fue posible actualizar las requisiciones:', error)

        if (showToast) {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: {
                message: 'No fue posible actualizar las requisiciones. Se mantiene el cache local.',
                type: 'error',
              },
            })
          )
        }

        return false
      } finally {
        syncingRef.current = false
        setSyncing(false)
      }
    },
    [backend, token, userKey]
  )

  useEffect(() => {
    if (!token || !userKey) return

    let active = true

    const initialize = async () => {
      await loadLocalSnapshot()
      if (active) await sync(false)
    }

    void initialize()

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void sync(false)
      }
    }, POLLING_INTERVAL_MS)

    const handleOnline = () => {
      void sync(false)
    }

    window.addEventListener('online', handleOnline)

    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('online', handleOnline)
    }
  }, [loadLocalSnapshot, sync, token, userKey])

  const autocompleteItems = useMemo<RequisitionAutocompleteItem[]>(
    () => flattenRequisitionOrders(snapshot?.orders || []),
    [snapshot]
  )

  return {
    snapshot,
    autocompleteItems,
    syncing,
    lastError,
    sync,
  }
}
