const api = window.betaPrinters
let state; let printers = []
const $ = id => document.getElementById(id)
const el = (tag, value) => { const node = document.createElement(tag); if (value) node.textContent = value; return node }
async function call(method, value) {
  const result = await api[method](value)
  if (!result.ok) throw Error(result.error)
  return result.data
}
async function run(action) { try { $('message').textContent = ''; await action() } catch (e) { $('message').textContent = e.message } }
function resolution(identity) {
  if (!identity) return 'Sin vincular'
  const matches = printers.filter(p => p.identity.driver === identity.driver)
  if (matches.length > 1) return 'Ambigua: verificar manualmente'
  if (matches.some(p => ['name', 'port', 'pnp'].every(k => p.identity[k] === identity[k]))) return 'Probable (sin serial físico)'
  return 'No encontrada: volver a vincular'
}
async function load() { state = await call('getStatus'); $('enabled').checked = state.enabled; $('panel').hidden = !state.enabled; $('message').textContent = state.diagnostic || ''; if (state.enabled) await refresh() }
async function refresh() {
  const result = await call('refresh'); printers = result.printers
  $('diagnostic').textContent = result.diagnostic || 'Inventario actualizado a petición del operador. No se consultan trabajos de impresión.'
  $('printers').replaceChildren()
  for (const p of printers) {
    const row = el('div'); row.className = 'row'
    row.append(el('strong', p.identity.name))
    const details = el('p', `Estado: ${p.status}\nDriver: ${p.identity.driver || 'Desconocido'}\nPuerto: ${p.identity.port || 'Desconocido'}\nPnP: ${p.identity.pnp || 'Desconocido'}\n${p.source}`); details.className = 'details'; row.append(details)
    const test = el('button', 'Previsualizar prueba de identificación'); test.disabled = printers.filter(q => q.identity.driver === p.identity.driver).length !== 1
    test.onclick = () => run(async () => { if (!window.confirm(`Vista previa: una página «Identificación BETA»\nCola: ${p.identity.name}\nPuerto: ${p.identity.port || 'Desconocido'}\n¿Continuar a confirmación y diálogo Windows?`)) return; const r = await call('testPrint', { identity: p.identity, confirmed: true }); $('message').textContent = r.cancelled ? 'Prueba cancelada.' : r.success ? 'Prueba enviada. Verifique físicamente la impresora.' : 'Prueba cancelada o no completada.' }); row.append(test); $('printers').append(row)
  }
  if (!printers.length) $('printers').append(el('p', 'No se detectaron impresoras.'))
  renderProfiles()
}
function renderProfiles() {
  $('profiles').replaceChildren()
  for (const profile of state.profiles) {
    const row = el('div'); row.className = 'row'
    const label = el('input'); label.value = profile.label; label.maxLength = 80; label.setAttribute('aria-label', 'Nombre del perfil')
    const select = el('select'); select.setAttribute('aria-label', `Impresora de ${profile.label}`)
    const empty = el('option', 'Sin vincular'); empty.value = ''; select.append(empty)
    printers.forEach((p, index) => { const option = el('option', p.identity.name); option.value = String(index); select.append(option) })
    const current = printers.findIndex(p => profile.identity && ['name', 'driver', 'port', 'pnp'].every(k => p.identity[k] === profile.identity[k]))
    select.value = current < 0 ? '' : String(current)
    const save = el('button', 'Guardar / volver a vincular')
    save.onclick = () => run(async () => { state = await call('saveProfile', { id: profile.id, label: label.value, identity: select.value === '' ? null : printers[Number(select.value)].identity }); renderProfiles() })
    const unlink = el('button', 'Desvincular'); unlink.onclick = () => run(async () => { state = await call('saveProfile', { ...profile, identity: null }); renderProfiles() })
    const remove = el('button', 'Eliminar'); remove.onclick = () => run(async () => { if (window.confirm(`¿Eliminar perfil ${profile.label}?`)) { state = await call('removeProfile', profile.id); renderProfiles() } })
    row.append(label, select, save, unlink, remove, el('p', `${resolution(profile.identity)}${profile.identity ? ' · Cola guardada: ' + profile.identity.name : ''}`)); $('profiles').append(row)
  }
}
$('enabled').onchange = () => run(async () => { try { await call('setEnabled', $('enabled').checked) } finally { await load() } })
$('refresh').onclick = () => run(refresh)
$('new').onsubmit = event => { event.preventDefault(); run(async () => { state = await call('saveProfile', { id: '', label: $('label').value, identity: null }); $('label').value = ''; renderProfiles() }) }
run(load)
