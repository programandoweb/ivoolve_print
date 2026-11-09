const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createWake } = require('../wake')

const STATION = '11111111-1111-4111-8111-111111111111'
function fakeIo() {
  const sockets = []
  const factory = (url, options) => {
    const socket = new EventEmitter()
    socket.url = url; socket.options = options; socket.emitted = []; socket.closed = false
    socket.emit = (event, payload, ack) => {
      if (event === 'printing.join') { socket.emitted.push(payload); socket.ack = ack; return true }
      return EventEmitter.prototype.emit.call(socket, event, payload)
    }
    socket.close = () => { socket.closed = true }
    sockets.push(socket)
    return socket
  }
  return { factory, sockets }
}
const sender = () => { const sent = []; return { sent, send: channel => sent.push(channel), isDestroyed: () => false } }
const make = (io, extra = {}) => createWake({ stationId: STATION, ioFactory: io.factory, urlFor: key => key === 'prod' ? 'https://hub.test' : null, baseFor: () => 'https://api.test/api/v1/', log: { info() {} }, ...extra })

test('conecta con el token del operador, se une a su estación y avisa al renderer', () => {
  const io = fakeIo(); const wake = make(io); const win = sender()
  assert.equal(wake.ensure(win, 'jwt', 'prod'), false)
  const [socket] = io.sockets
  assert.equal(socket.url, 'https://hub.test')
  assert.deepEqual(socket.options.auth, { token: 'jwt', api_base: 'https://api.test/api/v1' })
  socket.emit('connect')
  assert.deepEqual(socket.emitted, [{ station_id: STATION }])
  socket.ack({ ok: true })
  assert.equal(wake.ensure(win, 'jwt', 'prod'), true)
  socket.emit('printing.job.pending', { job_id: 4 })
  assert.deepEqual(win.sent, ['prisma:wake'])
  assert.equal(io.sockets.length, 1)
})

test('si el Hub rechaza el join o se desconecta, no se considera tiempo real', () => {
  const io = fakeIo(); const wake = make(io); const win = sender()
  wake.ensure(win, 'jwt', 'prod')
  const [socket] = io.sockets
  socket.emit('connect'); socket.ack({ ok: false, code: 'FORBIDDEN' })
  assert.equal(wake.ensure(win, 'jwt', 'prod'), false)
  socket.emit('connect'); socket.ack({ ok: true })
  assert.equal(wake.isJoined(), true)
  socket.emit('disconnect')
  assert.equal(wake.ensure(win, 'jwt', 'prod'), false)
})

test('un token nuevo reconecta y cierra el socket anterior', () => {
  const io = fakeIo(); const wake = make(io); const win = sender()
  wake.ensure(win, 'jwt-1', 'prod'); wake.ensure(win, 'jwt-2', 'prod')
  assert.equal(io.sockets.length, 2)
  assert.equal(io.sockets[0].closed, true)
  assert.equal(io.sockets[1].options.auth.token, 'jwt-2')
})

test('sin Hub configurado para el backend, o sin identidad de estación, no abre socket', () => {
  const io = fakeIo()
  assert.equal(make(io).ensure(sender(), 'jwt', 'dev'), false)
  assert.equal(createWake({ stationId: 'x', ioFactory: io.factory, urlFor: () => 'https://hub.test' }).ensure(sender(), 'jwt', 'prod'), false)
  assert.equal(io.sockets.length, 0)
})

test('no envía nada a una ventana destruida', () => {
  const io = fakeIo(); const wake = make(io)
  const win = { sent: [], send() { this.sent.push(1) }, isDestroyed: () => true }
  wake.ensure(win, 'jwt', 'prod')
  io.sockets[0].emit('printing.job.pending', {})
  assert.deepEqual(win.sent, [])
})
