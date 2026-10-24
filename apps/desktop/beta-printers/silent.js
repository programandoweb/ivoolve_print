const { resolve } = require('./core')

// Job payloads never choose a device. The operator selects a station-local profile.
function silentOptions(state, printers) {
  if (!state.enabled || !state.silentEnabled) return {}
  const profile = state.profiles.find(p => p.id === state.silentProfileId)
  if (!profile?.identity) throw Error('Impresión sin diálogo: seleccione un perfil vinculado en Impresoras BETA.')
  const match = resolve(profile.identity, printers)
  if (!['verified', 'probable'].includes(match.state)) throw Error('Impresión sin diálogo detenida: impresora no encontrada o ambigua. Revise y vuelva a vincular el perfil en Impresoras BETA.')
  const printer = match.candidates[0]
  if (/offline/i.test(printer.status || '')) throw Error('Impresión sin diálogo detenida: Windows informa que la impresora está fuera de línea.')
  return { silent: true, deviceName: printer.identity.name }
}
module.exports = { silentOptions }
