const BASE = 'https://backend.delicetiendavirtual.com/api/v1/'
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' })
function today(now = new Date()) {
  const parts = Object.fromEntries(dayFormat.formatToParts(now).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
function dispatchDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) throw Error('El despacho no informa una fecha válida.')
  if (/Z$|[+-]\d\d:\d\d$/.test(value)) {
    const date = new Date(value); if (!Number.isFinite(date.getTime())) throw Error('Fecha de despacho inválida.')
    return today(date)
  }
  const day = value.slice(0, 10)
  if (new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) !== day) throw Error('Fecha de despacho inválida.')
  return day
}
function validateInput(value) {
  if (!value || typeof value.number !== 'string' || !/^\d{1,6}$/.test(value.number) || Number(value.number) < 1) throw Error('Escribe un número de despacho válido, por ejemplo 02.')
  if (typeof value.token !== 'string' || value.token.length > 8192 || !/^[A-Za-z0-9_.-]+$/.test(value.token)) throw Error('Inicia sesión nuevamente para consultar los despachos.')
  if (value.dispatchId !== undefined && (!Number.isSafeInteger(value.dispatchId) || value.dispatchId < 1)) throw Error('Selección de despacho inválida.')
}
async function bytes(response, max) {
  if (Number(response.headers.get('content-length') || 0) > max) throw Error('La respuesta supera el tamaño permitido.')
  const chunks = []; let count = 0; const reader = response.body?.getReader()
  if (!reader) throw Error('Respuesta vacía del servidor.')
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      count += value.length; if (count > max) { await reader.cancel(); throw Error('La respuesta supera el tamaño permitido.') }
      chunks.push(Buffer.from(value))
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks)
}
function client(fetchImpl = fetch) {
  const request = async (suffix, token, pdf = false) => {
    let response
    try { response = await fetchImpl(BASE + suffix, { method: 'GET', headers: { Accept: pdf ? 'application/pdf' : 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, redirect: 'error', signal: AbortSignal.timeout(15000) }) } catch { throw Error('No fue posible consultar el servidor de despachos. Revisa la conexión.') }
    if ([401, 403].includes(response.status)) throw Error('Sesión vencida o sin permiso para consultar despachos. Inicia sesión nuevamente.')
    if (!response.ok) throw Error(pdf ? 'No se pudo obtener el PDF original del despacho.' : 'No fue posible consultar los despachos.')
    const body = await bytes(response, pdf ? 15 * 1024 * 1024 : 2 * 1024 * 1024)
    if (pdf) {
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/pdf') || body.subarray(0, 5).toString() !== '%PDF-') throw Error('El servidor no devolvió un PDF válido. No se imprimió.')
      return body
    }
    try { const json = JSON.parse(body.toString('utf8')); return json.data ?? json } catch { throw Error('El servidor devolvió datos no válidos.') }
  }
  const detail = async (id, token) => {
    const data = await request(`dashboard/dispatches/${id}`, token)
    if (!data.order || Number(data.order.id) !== id) throw Error('El despacho ya no está disponible.')
    return data.order
  }
  async function search(value, day) {
    validateInput(value)
    const matches = []; const seen = new Set(); let previousDay = '9999-99-99'; const deadline = Date.now() + 120000
    for (let page = 1; page <= 25; page++) {
      if (Date.now() > deadline) throw Error('La consulta tardó demasiado. No se imprimió; vuelve a intentar.')
      const query = new URLSearchParams({ search: value.number, page: String(page), per_page: '100' })
      const data = await request(`dashboard/dispatches?${query}`, value.token)
      const pagination = data.orders
      if (!pagination || !Array.isArray(pagination.data) || !Number.isSafeInteger(pagination.last_page) || pagination.last_page < 1) throw Error('Formato del listado de despachos no reconocido.')
      let reachedOlder = false
      for (const row of pagination.data) {
        if (Number(row.Orden ?? row.dispatch_number) !== Number(value.number)) continue
        const id = Number(row.id)
        if (!Number.isSafeInteger(id) || id < 1 || seen.has(id)) continue
        if (seen.size >= 200 || Date.now() > deadline) throw Error('La consulta es demasiado amplia. No se imprimió; verifica el número.')
        seen.add(id)
        const order = await detail(id, value.token)
        if (Number(order.dispatch_order_number) !== Number(value.number) || order.status !== 'dispatch') throw Error('El listado de despachos cambió. Vuelve a buscar.')
        const date = dispatchDay(order.dispatch_order_por)
        if (date > previousDay) throw Error('Cambió el orden del listado. Vuelve a buscar antes de imprimir.')
        previousDay = date
        if (date < day) { reachedOlder = true; continue }
        if (date === day) {
          if (typeof order.order_number !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(order.order_number)) throw Error('Referencia del despacho inválida.')
          matches.push({ id, number: String(Number(value.number)).padStart(2, '0'), kind: String(row.Tipo || order.dispatch_order_kind || 'Despacho').slice(0, 60), name: String(row.Nombre || order.client?.name || '').slice(0, 120), reference: order.order_number })
        }
      }
      // The existing endpoint sorts by dispatch day DESC. Detail dates verify this boundary.
      if (reachedOlder || page >= pagination.last_page) return matches
    }
    throw Error('La búsqueda es demasiado amplia. No se imprimió; verifica el número e inténtalo nuevamente.')
  }
  async function download(candidate, value, day) {
    const order = await detail(candidate.id, value.token)
    if (order.status !== 'dispatch' || Number(order.dispatch_order_number) !== Number(value.number) || dispatchDay(order.dispatch_order_por) !== day || order.order_number !== candidate.reference) throw Error('El despacho cambió o no corresponde al día actual. Vuelve a buscar.')
    return request(`pdf/print-dispatch?${new URLSearchParams({ value: candidate.reference })}`, null, true)
  }
  return { search, download }
}
module.exports = { client, today, dispatchDay, validateInput, bytes }
