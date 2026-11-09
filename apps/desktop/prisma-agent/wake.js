const { io } = require('socket.io-client')
const { apiBase, socketUrl } = require('../runtime-config')

// Aviso inmediato de trabajos de impresión (Event Hub). Solo una SEÑAL: al recibirla se le pide al
// renderer que consulte a Laravel (`station/print/next`) sin esperar al próximo ciclo de polling.
// La cola, la autorización y el trabajo siguen en Laravel; si el socket cae, el polling sigue activo.
// El token nunca se registra en logs y cada conexión solo sirve al backend que lo emitió.
function createWake({ stationId, ioFactory = io, urlFor = socketUrl, baseFor = apiBase, log = console }) {
  let socket = null; let current = null; let target = null; let joined = false

  function close() {
    if (socket) { socket.removeAllListeners(); socket.close() }
    socket = null; current = null; target = null; joined = false
  }

  // Devuelve true solo si el socket está unido a la sala de esta estación (el renderer puede espaciar el polling).
  function ensure(sender, token, backend) {
    if (typeof stationId !== 'string' || !/^[0-9a-f-]{36}$/.test(stationId)) return false
    const url = urlFor(backend)
    if (!url) return false
    const wanted = `${backend}|${token}`
    if (socket && current === wanted) { target = sender; return joined }
    close()
    current = wanted; target = sender
    socket = ioFactory(url, {
      transports: ['websocket'], reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 10000,
      auth: { token, api_base: baseFor(backend).replace(/\/+$/, '') },
    })
    socket.on('connect', () => {
      socket.emit('printing.join', { station_id: stationId }, ack => {
        joined = ack?.ok === true
        if (!joined) log.info?.('[Prisma wake] Join rechazado:', String(ack?.code || 'sin respuesta').slice(0, 40))
      })
    })
    socket.on('disconnect', () => { joined = false })
    socket.on('connect_error', () => { joined = false })
    socket.on('printing.job.pending', () => {
      if (target && !target.isDestroyed?.()) target.send('prisma:wake')
    })
    return false
  }

  return { ensure, close, isJoined: () => joined }
}

module.exports = { createWake }
