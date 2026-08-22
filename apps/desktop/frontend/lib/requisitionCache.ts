export type RequisitionRender = {
  id?: number
  lot_number?: string | null
  batch_code?: string | null
  subproceso_name?: string | null
  subproceso_asignado_a?: string | null
  subproceso_asignado_a_rol?: string | null
  subproceso_asignado_por?: string | null
  logicLocation?: string | null
  waiting_workshop_assignment?: boolean
}

export type RequisitionOrder = {
  priority?: number
  waiting_workshop_assignment?: boolean
  'Asignado por'?: string | null
  renders?: RequisitionRender[]
  id: number
  batch_code?: string | null
  producto?: string | null
  cantidad?: string | number | null
  fecha?: string | null
  tipo?: string | null
  btnFinish?: unknown
  btnCopy?: unknown
}

export type RequisitionSnapshot = {
  orders: RequisitionOrder[]
  count: number
  generated_at: string
}

export type RequisitionAutocompleteItem = {
  key: string
  batchCode: string
  assignedBy: string
  product: string
  quantity: string
  date: string
  order: RequisitionOrder
}

const DB_NAME = 'ivoolve_print_cache'
const DB_VERSION = 1
const STORE_NAME = 'snapshots'
const REQUISITION_KEY_PREFIX = 'production-order-requisitions'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function requisitionCacheKey(userKey: string | number | null | undefined) {
  return `${REQUISITION_KEY_PREFIX}:${String(userKey || 'anonymous')}`
}

export async function readRequisitionSnapshot(
  userKey: string | number | null | undefined
): Promise<RequisitionSnapshot | null> {
  if (typeof indexedDB === 'undefined') return null

  const db = await openDatabase()

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(requisitionCacheKey(userKey))

      request.onsuccess = () => resolve((request.result as RequisitionSnapshot) || null)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function writeRequisitionSnapshot(
  userKey: string | number | null | undefined,
  snapshot: RequisitionSnapshot
): Promise<void> {
  if (typeof indexedDB === 'undefined') return

  const db = await openDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(snapshot, requisitionCacheKey(userKey))

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export function flattenRequisitionOrders(
  orders: RequisitionOrder[]
): RequisitionAutocompleteItem[] {
  const results: RequisitionAutocompleteItem[] = []
  const seen = new Set<string>()

  for (const order of orders) {
    const codes = [order.batch_code]
      .map((code) => String(code || '').trim())
      .filter(Boolean)

    for (const batchCode of codes) {
      const uniqueKey = `${order.id}:${batchCode.toLocaleLowerCase()}`
      if (seen.has(uniqueKey)) continue
      seen.add(uniqueKey)

      results.push({
        key: uniqueKey,
        batchCode,
        assignedBy: String(order['Asignado por'] || '-'),
        product: String(order.producto || '-'),
        quantity: String(order.cantidad ?? '-'),
        date: String(order.fecha || '-'),
        order,
      })
    }
  }

  return results
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
}

export function searchRequisitions(
  items: RequisitionAutocompleteItem[],
  search: string,
  limit = 10
): RequisitionAutocompleteItem[] {
  const term = normalizeSearch(search)
  if (!term) return []

  return items
    .map((item) => {
      const batchCode = normalizeSearch(item.batchCode)
      const product = normalizeSearch(item.product)
      const assignedBy = normalizeSearch(item.assignedBy)
      const date = normalizeSearch(item.date)

      let score = 99
      if (batchCode === term) score = 0
      else if (batchCode.startsWith(term)) score = 1
      else if (product.startsWith(term)) score = 2
      else if (batchCode.includes(term)) score = 3
      else if (product.includes(term)) score = 4
      else if (assignedBy.includes(term)) score = 5
      else if (date.includes(term)) score = 6

      return { item, score }
    })
    .filter(({ score }) => score < 99)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ item }) => item)
}
