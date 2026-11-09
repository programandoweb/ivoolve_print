// Backends autorizados y origen del frontend. Lista fija: el renderer solo envía
// una clave ('prod' | 'dev'), nunca una URL, y cada token solo se usa contra el
// backend que lo emitió.
// QA: IVOOLVE_PRINT_DEV=1 + IVOOLVE_PRINT_FRONTEND_URL (p. ej. http://localhost:3030)
// permiten cargar un frontend local, solo en builds NO empaquetadas.
const BACKENDS = Object.freeze({
  prod: 'https://backend.delicetiendavirtual.com',
  dev: 'https://dev.backend.delicetiendavirtual.com',
})
// Event Hub (Socket.IO) por backend. Sin entrada = sin aviso inmediato: se usa solo el polling.
const SOCKETS = Object.freeze({
  prod: 'https://socket.delicetiendavirtual.com',
})
const PROD_FRONTEND = 'https://ivoolve-print-frontend.vercel.app'

function packaged() {
  try { return require('electron').app?.isPackaged === true } catch { return false }
}
function localOrigin(value) {
  let url
  try { url = new URL(value) } catch { throw Error('IVOOLVE_PRINT_FRONTEND_URL no es una URL válida.') }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw Error('IVOOLVE_PRINT_FRONTEND_URL debe ser https (o http en localhost).')
  return url.origin
}
function frontendOrigin(env = process.env, isPackaged = packaged()) {
  return env.IVOOLVE_PRINT_DEV === '1' && !isPackaged && env.IVOOLVE_PRINT_FRONTEND_URL ? localOrigin(env.IVOOLVE_PRINT_FRONTEND_URL) : PROD_FRONTEND
}
function backendKey(key = 'prod') {
  if (!Object.hasOwn(BACKENDS, key)) throw Error('Backend no autorizado.')
  return key
}
// https://<backend>/api/v1/ — misma forma que usaban las constantes BASE.
function apiBase(key) { return BACKENDS[backendKey(key)] + '/api/v1/' }

function socketUrl(key) { return SOCKETS[backendKey(key)] || null }

module.exports = { frontendOrigin: frontendOrigin(), resolveFrontendOrigin: frontendOrigin, backendKey, apiBase, socketUrl, BACKENDS, SOCKETS, PROD_FRONTEND }
