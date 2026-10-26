const { bytes, today } = require('../dispatch-print/service')
const BASE = 'https://backend.delicetiendavirtual.com/api/v1/printing-agent/'
const ORIGIN = 'https://ivoolve-print-frontend.vercel.app'
function token(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]{1,8192}$/.test(value)) throw Error('Inicia sesión nuevamente.')
}
function commands(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) throw Error('Solicitud de impresión inválida.')
  let copies = 0; const seen = new Set()
  for (const command of value) {
    const label = command.kind === 'labels'
    if (!['labels', 'letterhead'].includes(command.kind) || typeof command.number !== 'string' || !(label ? /^\d{1,12}$/ : /^\d{1,6}$/).test(command.number) || Number(command.number) < 1 || !Number.isSafeInteger(command.quantity) || command.quantity < 1 || command.quantity > (label ? 100 : 1)) throw Error('Solicitud de impresión inválida.')
    const key = `${command.kind}:${Number(command.number)}`
    if (seen.has(key)) throw Error('La solicitud contiene documentos repetidos.')
    seen.add(key); copies += command.quantity
    if (label && command.payload !== undefined) {
      const rows = command.payload?.print
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0].quantity !== command.quantity || !['title', 'code', 'variant_name', 'abbreviation'].every(key => typeof rows[0][key] === 'string' && rows[0][key].length <= 1000) || !rows[0].code) throw Error('Datos de etiqueta inválidos.')
    }
  }
  if (copies > 100) throw Error('El límite por solicitud es de 100 impresiones.')
  return value
}
function register({ ipcMain, profiles, printLabels, printLetterhead, stationId, fetchImpl = fetch, now = () => new Date() }) {
  const shells = new WeakSet(); const busy = new WeakSet(); const sessions = new WeakMap()
  const supervised = new WeakMap()
  let lastSupervisedProbeLog = 0
  function authorize(event) {
    let origin
    try { origin = new URL(event.senderFrame.url).origin } catch {}
    if (!shells.has(event.sender) || event.senderFrame !== event.sender.mainFrame || origin !== ORIGIN) throw Error('Origen no autorizado.')
  }
  async function request(action, auth, data, method = 'POST') {
    token(auth)
    let response
    try { response = await fetchImpl(BASE + action, { method, headers: { Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${auth}` }, ...(method === 'POST' ? { body: JSON.stringify(data) } : {}), redirect: 'error', signal: AbortSignal.timeout(action.startsWith('station/') ? 5000 : 90000) }) } catch { throw Error('No fue posible contactar a Prisma. Revisa la conexión; no se reintentó el envío.') }
    const body = await bytes(response, 256 * 1024)
    let result
    try { result = JSON.parse(body.toString('utf8')) } catch { throw Error('Prisma devolvió una respuesta no válida. Actualiza el backend.') }
    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw Error('Sesión vencida o sin permiso. Inicia sesión nuevamente.')
      // Application-authored messages only. Never expose backend debug output or upstream errors.
      const message = result.message
      if ([409, 422, 503, 429].includes(response.status) && typeof message === 'string' && message.length <= 300 && !/https?:|stack|exception|api.?key\s*[:=]|Bearer /i.test(message)) throw Error(message)
      throw Error('Prisma no está disponible. Actualiza el backend o utiliza los buscadores manuales.')
    }
    if (!result.data || typeof result.data !== 'object') throw Error('Respuesta de Prisma no reconocida.')
    return result.data
  }
  const summary = session => {
    const results = session.results.slice(session.reported || 0)
    session.reported = session.results.length
    return { results, remaining: session.commands.length - session.index }
  }
  async function advance(event, session, dispatchId) {
    while (session.index < session.commands.length) {
      if (sessions.get(event.sender) !== session) throw Error('La sesión cambió. No se enviaron más documentos.')
      if (session.date !== today(now())) throw Error('Cambió el día. Vuelve a solicitar los documentos pendientes.')
      const command = session.commands[session.index]
      let result
      if (command.kind === 'labels') result = await printLabels(event, command.payload)
      else result = await printLetterhead(event, { number: command.number, token: session.token, ...(dispatchId ? { dispatchId } : {}) })
      dispatchId = undefined
      if (result?.ok && result.status === 'choose') {
        session.candidates = result.candidates
        return { ok: true, status: 'choose', number: command.number, candidates: result.candidates, ...summary(session) }
      }
      const ok = result?.ok === true
      session.results.push({ kind: command.kind, number: command.number, quantity: command.quantity, ok, message: ok ? 'Enviado a la cola de impresión.' : 'El trabajo fue cancelado o falló. No se reintentó.' })
      session.index++
      if (!ok) {
        sessions.delete(event.sender)
        return { ok: true, status: 'stopped', message: result?.error || 'La impresión se detuvo. Los trabajos restantes no se enviaron.', ...summary(session) }
      }
    }
    sessions.delete(event.sender)
    return { ok: true, status: 'completed', message: 'Solicitud enviada a la cola de impresión. Esto no confirma la salida física del papel.', ...summary(session) }
  }
  function handle(channel, handler) {
    ipcMain.handle(channel, async (event, value) => {
      authorize(event)
      const diagnostic = channel === 'prisma:poll' || channel === 'prisma:acknowledge'
      if (!diagnostic && busy.has(event.sender)) return { ok: false, error: 'Prisma está procesando una solicitud. Espera a que termine.' }
      if (sessions.has(event.sender) && ['prisma:interpret', 'prisma:execute'].includes(channel)) return { ok: false, error: 'Selecciona o cancela el membrete pendiente antes de otra solicitud.' }
      if (!diagnostic) busy.add(event.sender)
      try { return await handler(event, value) } catch (error) {
        if (channel === 'prisma:supervised-next') {
          // Main-process diagnostics only; never log tokens, jobs or HTTP headers.
          console.warn('[Prisma supervised] Claim request failed:', String(error?.message || 'unknown error').slice(0, 180))
        }
        const session = sessions.get(event.sender)
        sessions.delete(event.sender)
        const message = String(error?.message || '')
        const safe = message.length <= 300 && !/https?:|\/workspace|node_modules|Bearer |stack|exception/i.test(message)
        return { ok: false, error: safe && message ? message : 'No fue posible completar la solicitud. No se reintentó la impresión.', ...(session ? summary(session) : {}) }
      } finally { if (!diagnostic) busy.delete(event.sender) }
    })
  }
  handle('prisma:poll', async (_event, value) => {
    if (typeof stationId !== 'string' || !/^[0-9a-f-]{36}$/.test(stationId)) throw Error('Identidad de la estación no disponible.')
    const result = await request('station/poll', value?.token, { station_id: stationId })
    if (result.connected !== true || !Array.isArray(result.signals) || result.signals.length > 20
      || result.signals.some(s => !Number.isSafeInteger(s.receipt_id) || !['labels', 'letterhead', 'channel', 'lookup'].includes(s.kind) || (s.document_number != null && (typeof s.document_number !== 'string' || !/^[0-9]{1,12}$/.test(s.document_number))) || (s.lookup_status != null && !['found', 'not_found', 'choose'].includes(s.lookup_status)) || (s.kind === 'lookup' && !['not_found', 'choose'].includes(s.lookup_status)) || (s.kind !== 'lookup' && ![null, undefined, 'found'].includes(s.lookup_status)) || (s.document_title != null && (typeof s.document_title !== 'string' || s.document_title.length > 120)) || (s.document_variant != null && (typeof s.document_variant !== 'string' || s.document_variant.length > 100)) || (s.document_query != null && (typeof s.document_query !== 'string' || s.document_query.length > 160)))) throw Error('Señales no reconocidas.')
    return { ok: true, connected: true, signals: result.signals }
  })
  handle('prisma:acknowledge', async (_event, value) => {
    if (!value || !Array.isArray(value.receipt_ids) || value.receipt_ids.length < 1 || value.receipt_ids.length > 20
      || value.receipt_ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw Error('Acuse de señal inválido.')
    const result = await request('station/acknowledge', value.token, { station_id: stationId, receipt_ids: value.receipt_ids })
    if (!Number.isSafeInteger(result.acknowledged) || result.acknowledged < 0) throw Error('Acuse no reconocido.')
    return { ok: true, acknowledged: result.acknowledged }
  })
  // One-shot supervised jobs: fetched and claimed with the station JWT.
  // The document payload NEVER comes from a renderer argument or from WhatsApp.
  handle('prisma:supervised-next', async (event, value) => {
    if (supervised.has(event.sender)) {
      console.info('[Prisma supervised] Existing claimed job awaiting execution')
      return { ok: true, job: null }
    }
    // Low-frequency diagnostic proves whether the renderer calls the supervised endpoint.
    const timestamp = Date.now()
    if (timestamp - lastSupervisedProbeLog > 30000) {
      console.info('[Prisma supervised] Checking Laravel for pending jobs')
      lastSupervisedProbeLog = timestamp
    }
    const received = await request('station/print/next', value?.token, { station_id: stationId })
    const job = received.job
    if (job != null) console.info('[Prisma supervised] Job claimed; opening supervised flow, job_id:', job.id)
    if (job == null) return { ok: true, job: null }
    if (!Number.isSafeInteger(job.id) || job.id < 1
        || !['labels', 'letterhead'].includes(job.kind)
        || typeof job.number !== 'string' || !/^[0-9]{1,12}$/.test(job.number)
        || !Number.isSafeInteger(job.quantity) || job.quantity < 1
        || job.quantity > (job.kind === 'labels' ? 100 : 1)
        || typeof job.title !== 'string' || job.title.length > 120
        || typeof job.variant !== 'string' || job.variant.length > 100
        || (job.dispatch_id != null && (!Number.isSafeInteger(job.dispatch_id) || job.dispatch_id < 1))
        || (job.kind === 'labels' && !job.payload)
        || (job.kind === 'letterhead' && job.payload != null)) throw Error('Trabajo supervisado no válido; no se imprimió.')
    commands([{ kind: job.kind, number: job.number, quantity: job.quantity,
      ...(job.kind === 'labels' ? { payload: job.payload } : {}) }])
    supervised.set(event.sender, { job, token: value.token })
    return { ok: true, job: { id: job.id, kind: job.kind, number: job.number, quantity: job.quantity,
      title: job.title, variant: job.variant, source: job.source } }
  })
  // Whitelist internal profile-validation failures. Never print arbitrary exception text,
  // printer identifiers, filesystem paths, JWTs, or document contents to diagnostics.
  const profileDiagnostics = {
    'Origen Prisma no autorizado': ['ORIGIN', 'La ventana solicitante no coincide con la ventana principal autorizada de Electron.'],
    'Configuración de impresoras desactivada': ['BETA_DISABLED', 'Activa Perfiles BETA en la configuración local.'],
    'Prisma no está autorizado en el perfil local de impresora': ['PROFILE_AUTH', 'Selecciona el perfil correspondiente, vincula su impresora y habilita Autorizar Prisma.'],
    'El perfil cambió durante la validación': ['PROFILE_CHANGED', 'El perfil cambió mientras se comprobaba la impresora; revisa la configuración local.'],
    'Impresora no identificada de forma unívoca': ['IDENTITY_UNVERIFIED', 'Vuelve a vincular el perfil con la cola de impresión correcta en Impresoras BETA.'],
    'Existen impresoras ambiguas; verifique el perfil en Impresoras BETA': ['AMBIGUOUS_PRINTER', 'La identidad coincide con varias colas; vincula una cola inequívoca.'],
    'Windows indica que la impresora está fuera de línea': ['PRINTER_OFFLINE', 'Comprueba en Windows que la cola vinculada esté en línea.'],
  }
  const explainSupervisedError = (error, stage) => {
    if (stage !== 'validate_profile') return { code: 'DOCUMENT_OR_DIALOG', hint: 'Falló la preparación o apertura del diálogo; revisar el proceso de impresión.' }
    const entry = profileDiagnostics[String(error?.message || '')]
    return entry ? { code: entry[0], hint: entry[1] }
      : { code: 'PROFILE_VALIDATION_UNKNOWN', hint: 'Fallo inesperado en validación de perfil; revisar el inventario de impresoras y la configuración local.' }
  }
  handle('prisma:supervised-execute', async (event, value) => {
    const selected = supervised.get(event.sender)
    if (!selected || selected.job.id !== value?.job_id || selected.token !== value?.token) {
      throw Error('La solicitud de impresión supervisada no está disponible.')
    }
    // Consume local authorization before calling a printer, so no duplicate
    // click, navigation or network retry can execute it twice.
    supervised.delete(event.sender)
    const job = selected.job
    let outcome = 'failed'
    let message = 'No se completó el envío a la cola Windows.'
    let stage = 'validate_profile'
    try {
      await profiles.getPrismaPrintPlan(event, job.kind)
      stage = 'prepare_and_open_dialog'
      const result = job.kind === 'labels'
        ? await printLabels(event, job.payload, { prismaSupervised: true })
        : await printLetterhead(event, {
          token: selected.token, number: job.number,
          ...(job.dispatch_id != null ? { dispatchId: job.dispatch_id } : {}),
        }, { prismaSupervised: true })
      if (result?.ok && result.status !== 'choose') {
        outcome = 'submitted'
        message = 'El operador confirmó el diálogo. Enviado a la cola Windows; no se confirma la salida física.'
      } else {
        outcome = 'cancelled_or_failed'
        message = result?.status === 'choose'
          ? 'Hay varios despachos con este número. No se imprimió: especifica el despacho.'
          : 'El diálogo se canceló o falló. No se reintentó la impresión.'
      }
    } catch (error) {
      const diagnostic = explainSupervisedError(error, stage)
      console.warn('[Prisma supervised] EXECUTION FAILED', { job_id: job.id, kind: job.kind, stage, code: diagnostic.code, action: diagnostic.hint, error_type: error instanceof TypeError ? 'TypeError' : 'Error', retry: 'disabled', windows_dialog_opened: false })
      outcome = String(error?.message || '').includes('perfil') || String(error?.message || '').includes('Prisma no está autorizado')
        ? 'profile_blocked' : 'failed'
      message = outcome === 'profile_blocked'
        ? 'El perfil local no autoriza esta impresión de Prisma. No se imprimió nada.'
        : 'No fue posible preparar el documento o abrir el diálogo. No se reintentó.'
    }
    // Completion is best effort; failures must NEVER replay a claimed job.
    let recorded = false
    try {
      const receipt = await request('station/print/complete', selected.token, {
        station_id: stationId, job_id: job.id, outcome,
      })
      recorded = receipt.recorded === true
    } catch { /* no print retry */ }
    return { ok: true, status: outcome, message, recorded, job_id: job.id }
  })
  handle('prisma:status', async (event, value) => {
    const agent = await request('status', value?.token, null, 'GET')
    if (typeof agent.enabled !== 'boolean' || typeof agent.available !== 'boolean' || agent.slug !== 'prisma') throw Error('Estado de Prisma no reconocido.')
    return { ok: true, status: agent.available ? 'available' : 'unavailable', agent }
  })
  handle('prisma:interpret', async (event, value) => {
    if (sessions.has(event.sender)) throw Error('Selecciona o cancela el membrete pendiente antes de otra solicitud.')
    if (!value || typeof value.text !== 'string' || value.text.length < 1 || value.text.length > 1000 || !Array.isArray(value.history) || value.history.length > 6 || value.history.some(t => typeof t !== 'string' || t.length > 1000)) throw Error('Mensaje de Prisma inválido.')
    const result = await request('interpret', value.token, { text: value.text, history: value.history })
    if (typeof result.message !== 'string' || result.message.length > 1000 || !Array.isArray(result.commands)) throw Error('Respuesta de Prisma no reconocida.')
    if (result.commands.length) {
      commands(result.commands)
      if (typeof result.plan_token !== 'string' || result.plan_token.length > 16000 || typeof result.requires_confirmation !== 'boolean') throw Error('Plan de Prisma inválido.')
    }
    return { ok: true, status: 'interpreted', ...result }
  })
  handle('prisma:execute', async (event, value) => {
    if (sessions.has(event.sender)) throw Error('Ya hay una selección pendiente. Finalízala o cancélala.')
    if (!value || typeof value.plan_token !== 'string' || value.plan_token.length > 16000 || typeof value.confirmed !== 'boolean') throw Error('Plan de Prisma inválido.')
    const result = await request('claim', value.token, { plan_token: value.plan_token, confirmed: value.confirmed })
    const work = commands(result.commands)
    if (result.date !== today(now()) || work.some(c => c.kind === 'labels' && !c.payload)) throw Error('La solicitud venció o sus datos no son válidos.')
    // Check ALL routes before printing the first document. The existing handlers revalidate before submission.
    for (const kind of new Set(work.map(c => c.kind))) await profiles.getPrintPlan(event, kind)
    const session = { commands: work, index: 0, date: result.date, token: value.token, results: [], candidates: null }
    sessions.set(event.sender, session)
    return advance(event, session)
  })
  handle('prisma:choose', async (event, value) => {
    const session = sessions.get(event.sender)
    if (!session?.candidates || value?.token !== session.token || !Number.isSafeInteger(value?.dispatchId) || !session.candidates.some(c => c.id === value.dispatchId)) throw Error('Selección de despacho inválida.')
    session.candidates = null
    return advance(event, session, value.dispatchId)
  })
  handle('prisma:cancel', async event => {
    const session = sessions.get(event.sender)
    sessions.delete(event.sender)
    return { ok: true, status: 'cancelled', message: 'Solicitud pendiente cancelada. Los documentos ya enviados conservan su estado.', ...(session ? summary(session) : {}) }
  })
  return shell => {
    shells.add(shell.webContents)
    shell.webContents.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => { if (mainFrame) { sessions.delete(shell.webContents); supervised.delete(shell.webContents) } })
    shell.webContents.once('destroyed', () => { sessions.delete(shell.webContents); supervised.delete(shell.webContents) })
  }
}
module.exports = { register, commands }
