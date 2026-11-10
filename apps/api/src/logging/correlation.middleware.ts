import { randomUUID } from 'node:crypto'
import { CORRELATION_ID, correlationStore } from './logger'

// Propaga/genera X-Correlation-Id. Solo se acepta un id con formato seguro; no cambia el contrato
// de ninguna ruta (es un header adicional y opcional).
export function correlationMiddleware(req: any, res: any, next: () => void) {
  const inbound = req.headers?.['x-correlation-id']
  const id = typeof inbound === 'string' && CORRELATION_ID.test(inbound) ? inbound : randomUUID()
  req.correlationId = id
  req.startedAt = Date.now()
  try { res.setHeader('X-Correlation-Id', id) } catch { /* cabecera ya enviada */ }
  correlationStore.run(id, next)
}
