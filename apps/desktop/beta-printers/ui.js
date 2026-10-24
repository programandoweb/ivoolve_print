const api = window.betaPrinters
let state; let printers = []
const $ = id => document.getElementById(id)
const el = (tag, value, classes) => { const node = document.createElement(tag); if (value) node.textContent = value; if (classes) node.className = classes; return node }
const paths = {
  printer: ['M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v8H6z', 'M18 12h.01'],
  sliders: ['M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3', 'M1 14h6m2-6h6m2 8h6'],
  layers: ['m12 3 10 5-10 5L2 8Z', 'm2 12 10 5 10-5', 'm2 16 10 5 10-5'],
  shield: ['M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z', 'm9 12 2 2 4-4'],
  power: ['M12 2v10', 'M6 5a9 9 0 1 0 12 0'],
  bolt: ['m13 2-9 12h7l-1 8 10-12h-7Z'],
  refresh: ['M20 7v5h-5', 'M4 17v-5h5', 'M6 7a7 7 0 0 1 11-2l3 3', 'M4 16l3 3a7 7 0 0 0 11-2'],
  plus: ['M12 5v14', 'M5 12h14'],
  info: ['M12 16v-4', 'M12 8h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'],
  link: ['M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2', 'M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2'],
  unlink: ['m2 2 20 20', 'm8 8-4 4a5 5 0 0 0 7 7l2-2', 'm16 16 4-4a5 5 0 0 0-7-7l-2 2'],
  trash: ['M3 6h18', 'M9 6V3h6v3', 'm5 6 1 15h12l1-15', 'M10 10v7m4-7v7'],
  check: ['m5 12 4 4L19 6'],
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false')
  for (const d of paths[name] || paths.printer) { const p = document.createElementNS(svg.namespaceURI, 'path'); p.setAttribute('d', d); svg.append(p) }
  return svg
}
for (const node of document.querySelectorAll('[data-icon]')) node.append(icon(node.dataset.icon))
function button(label, symbol, classes = 'btn btn-secondary') {
  const node = el('button', null, classes); node.type = 'button'; node.append(icon(symbol), el('span', label)); return node
}
function field(label, input) { const node = el('label', null, 'block'); node.append(el('span', label, 'field-label'), input); return node }
async function call(method, value) {
  const result = await api[method](value)
  if (!result.ok) throw Error(result.error)
  return result.data
}
async function run(action) { try { $('message').textContent = ''; await action() } catch (e) { $('message').textContent = e.message } }
function resolution(identity, profileId) {
  if (!identity) return { label: 'Sin vincular', className: 'tag tag-neutral' }
  const matches = printers.filter(p => p.identity.driver === identity.driver)
  if (matches.length > 1 && profileId === state.silentProfileId && state.silentQueueConfirmation && ['name', 'driver', 'port', 'pnp', 'serial'].every(k => state.silentQueueConfirmation[k] === identity[k]) && matches.filter(p => ['name', 'driver', 'port', 'pnp', 'serial'].every(k => p.identity[k] === identity[k])).length === 1) return { label: 'Cola confirmada', className: 'tag tag-warning' }
  if (matches.length > 1) return { label: 'Ambigua', className: 'tag tag-warning' }
  if (matches.some(p => ['name', 'port', 'pnp'].every(k => p.identity[k] === identity[k]))) return { label: 'Probable · Sin serial', className: 'tag tag-warning' }
  return { label: 'No encontrada', className: 'tag tag-warning' }
}
async function load() {
  state = await call('getStatus')
  $('enabled').checked = state.enabled; $('panel').hidden = !state.enabled; $('disabled-state').hidden = state.enabled
  $('message').textContent = state.diagnostic || ''
  if (state.enabled) await refresh()
}
async function refresh() {
  $('refresh').disabled = true
  try {
    const result = await call('refresh'); printers = result.printers
    $('diagnostic').textContent = result.diagnostic || 'Inventario actualizado correctamente. Las impresoras se consultan al actualizar y antes de cada envío sin diálogo.'
    $('last-refresh').textContent = 'Última actualización: ' + new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())
    $('printer-count').textContent = String(printers.length); $('inventory-count').textContent = String(printers.length)
    $('printers').replaceChildren()
    for (const p of printers) {
      const row = el('article', null, 'printer-card')
      const top = el('div', null, 'card-top'); const tile = el('span', null, 'icon-tile'); tile.append(icon('printer'))
      const offline = /offline/i.test(p.status)
      top.append(tile, el('span', offline ? 'Fuera de línea' : 'Estado desconocido', offline ? 'tag tag-warning' : 'tag tag-neutral'))
      const meta = el('dl', null, 'printer-meta mt-4')
      for (const [key, value] of [['Driver', p.identity.driver], ['Puerto', p.identity.port]]) meta.append(el('dt', key), el('dd', value || 'No disponible'))
      const details = el('details', null, 'printer-details'); details.append(el('summary', 'Ver identificación técnica'), el('p', 'PnP: ' + (p.identity.pnp || 'No disponible')), el('p', p.source))
      const test = button('Prueba de identificación', 'printer'); test.disabled = printers.filter(q => q.identity.driver === p.identity.driver).length !== 1
      if (test.disabled) test.title = 'Destino ambiguo: verifica primero las impresoras desde Windows.'
      test.onclick = () => run(async () => {
        if (!window.confirm(`Vista previa: una página «Identificación BETA»\nCola: ${p.identity.name}\nPuerto: ${p.identity.port || 'Desconocido'}\n¿Continuar a confirmación y diálogo Windows?`)) return
        const r = await call('testPrint', { identity: p.identity, confirmed: true })
        $('message').textContent = r.cancelled ? 'Prueba cancelada.' : r.success ? 'Prueba enviada. Verifique físicamente la impresora.' : 'Prueba cancelada o no completada.'
      })
      row.append(top, el('h3', p.identity.name, 'card-title'), meta, details, test); $('printers').append(row)
    }
    if (!printers.length) $('printers').append(el('p', 'No se detectaron impresoras. Comprueba la conexión y actualiza la lista.', 'empty-list'))
    renderProfiles()
  } finally { $('refresh').disabled = false }
}
function renderProfiles() {
  renderSilentSettings()
  $('profile-count').textContent = state.profiles.filter(p => p.identity).length + ' / ' + state.profiles.length
  $('profiles').replaceChildren()
  for (const profile of state.profiles) {
    const row = el('article', null, 'profile-card'); const heading = el('div', null, 'profile-heading')
    const title = el('div', null, 'flex items-center gap-2'); const tile = el('span', null, 'icon-tile'); tile.append(icon('layers'))
    title.append(tile, el('h3', profile.label, 'text-sm font-semibold text-slate-700'))
    const match = resolution(profile.identity, profile.id); heading.append(title, el('span', match.label, match.className))
    const label = el('input'); label.value = profile.label; label.maxLength = 80
    const select = el('select'); select.setAttribute('aria-label', `Impresora de ${profile.label}`)
    const empty = el('option', 'Selecciona una impresora'); empty.value = ''; select.append(empty)
    printers.forEach((p, index) => { const option = el('option', p.identity.name); option.value = String(index); select.append(option) })
    const current = printers.findIndex(p => profile.identity && ['name', 'driver', 'port', 'pnp'].every(k => p.identity[k] === profile.identity[k]))
    select.value = current < 0 ? '' : String(current)
    const body = el('div', null, 'profile-body'); body.append(field('Nombre del perfil', label), field('Impresora asignada', select), el('p', profile.identity ? 'Cola guardada: ' + profile.identity.name : 'Vincula una impresora para utilizar este perfil.', 'binding-note'))
    const save = button('Guardar', 'check', 'btn btn-primary')
    save.onclick = () => run(async () => { state = await call('saveProfile', { id: profile.id, label: label.value, identity: select.value === '' ? null : printers[Number(select.value)].identity }); renderProfiles(); $('message').textContent = 'Perfil guardado correctamente.' })
    const unlink = button('Desvincular', 'unlink', 'btn btn-quiet'); unlink.disabled = !profile.identity
    unlink.onclick = () => run(async () => { state = await call('saveProfile', { ...profile, identity: null }); renderProfiles() })
    const remove = button('Eliminar', 'trash', 'btn btn-danger ml-auto')
    remove.setAttribute('aria-label', 'Eliminar perfil ' + profile.label)
    remove.onclick = () => run(async () => { if (window.confirm(`¿Eliminar perfil ${profile.label}?`)) { state = await call('removeProfile', profile.id); renderProfiles() } })
    const actions = el('div', null, 'profile-actions'); actions.append(save, unlink, remove)
    row.append(heading, body, actions); $('profiles').append(row)
  }
}
function renderSilentSettings() {
  $('silent').checked = Boolean(state.silentEnabled)
  $('silent-profile').replaceChildren()
  const empty = el('option', 'Selecciona un perfil vinculado'); empty.value = ''; $('silent-profile').append(empty)
  for (const profile of state.profiles) {
    const option = el('option', profile.label + (profile.identity ? ' · ' + profile.identity.name : ' · Sin vincular'))
    option.value = profile.id; option.disabled = !profile.identity; $('silent-profile').append(option)
  }
  $('silent-profile').value = state.silentProfileId || ''
  $('silent-status').textContent = state.silentEnabled ? 'Activo · ' + (state.profiles.find(p => p.id === state.silentProfileId)?.label || 'Perfil eliminado: revisa la configuración') : 'Con diálogo Windows · Modo habitual'
  $('mode-summary').textContent = state.silentEnabled ? 'Sin diálogo' : 'Con diálogo'
}
async function saveSilentSettings() {
  try { state = await call('setSilentSettings', { enabled: $('silent').checked, profileId: $('silent-profile').value }) } finally { renderSilentSettings() }
}
$('silent').onchange = () => run(saveSilentSettings)
$('silent-profile').onchange = () => run(saveSilentSettings)
$('enabled').onchange = () => run(async () => { try { await call('setEnabled', $('enabled').checked) } finally { await load() } })
$('refresh').onclick = () => run(refresh)
$('new').onsubmit = event => { event.preventDefault(); run(async () => { state = await call('saveProfile', { id: '', label: $('label').value, identity: null }); $('label').value = ''; renderProfiles() }) }
run(load)
