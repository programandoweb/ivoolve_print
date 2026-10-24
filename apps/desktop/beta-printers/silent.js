const { resolve } = require('./core')
const keys = ['name', 'driver', 'port', 'pnp', 'serial']
const sameIdentity = (a, b) => Boolean(a && b && keys.every(key => a[key] === b[key]))
function manualQueueCandidate(identity, printers) {
  // Missing CIM metadata cannot support an explicit queue/port confirmation.
  if (!identity?.name || !identity.driver || !identity.port) return null
  if (printers.filter(p => p.identity.name === identity.name).length !== 1) return null
  const exact = printers.filter(p => sameIdentity(identity, p.identity))
  return exact.length === 1 ? exact[0] : null
}
function printProfile(state, profileId = state.labelsProfileId) {
  if (!state.enabled || !profileId) return null
  const profile = state.profiles.find(p => p.id === profileId)
  if (!profile) throw Error('Perfil de impresión no encontrado. Seleccione un destino en Impresoras BETA.')
  if (!profile.enabled) throw Error('Perfil de impresión desactivado. Actívelo o seleccione otro perfil en Impresoras BETA.')
  return profile
}
// Job payloads never choose a device. The operator selects a station-local profile.
function silentOptions(state, printers, profileId = state.labelsProfileId) {
  const profile = printProfile(state, profileId)
  if (!profile?.silentEnabled) return {}
  if (!profile?.identity) throw Error('Impresión sin diálogo: seleccione un perfil vinculado en Impresoras BETA.')
  const match = resolve(profile.identity, printers)
  let printer = match.candidates[0]
  if (match.state === 'ambiguous') {
    printer = manualQueueCandidate(profile.identity, printers)
    if (printer && !sameIdentity(profile.silentQueueConfirmation, profile.identity)) {
      const error = Error('Impresión sin diálogo: confirme manualmente la cola Windows y el puerto de la impresora seleccionada.')
      error.code = 'QUEUE_CONFIRMATION_REQUIRED'
      throw error
    }
  } else if (!['verified', 'probable'].includes(match.state)) printer = null
  if (!printer) throw Error('Impresión sin diálogo detenida: impresora no encontrada o ambigua. Revise y vuelva a vincular el perfil en Impresoras BETA.')
  if (/offline/i.test(printer.status || '')) throw Error('Impresión sin diálogo detenida: Windows informa que la impresora está fuera de línea.')
  return { silent: true, deviceName: printer.identity.name }
}
module.exports = { silentOptions, printProfile, sameIdentity, manualQueueCandidate }
