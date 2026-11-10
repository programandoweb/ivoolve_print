'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { client } = require('../service')

const MB = 1024 * 1024
const input = { number: '4', token: 'TOKEN-DE-PRUEBA', backend: 'prod', dispatchId: 345 }
// Respuesta simulada de `bytes` MB; `declare` controla el content-length que dice el servidor.
const big = (bytes, type = 'application/json', declare = true) => new Response('x'.repeat(bytes), { status: 200, headers: { 'content-type': type, ...(declare ? { 'content-length': String(bytes) } : {}) } })

test('detalle del despacho demasiado grande: el error dice QUÉ respuesta y cuánto declara el servidor', async () => {
  const service = client(async () => big(17 * MB))
  await assert.rejects(() => service.downloadExact(input), err => {
    assert.match(err.message, /^La respuesta del detalle del despacho supera el tamaño permitido \(límite 16 MB, el servidor declara 17\.0 MB\)\.$/)
    assert.ok(!err.message.includes('TOKEN'))
    return true
  })
})

test('listado de despachos demasiado grande se distingue del detalle', async () => {
  const service = client(async () => big(2.5 * MB))
  await assert.rejects(() => service.search(input, '2026-11-10'), /La respuesta del listado de despachos supera el tamaño permitido \(límite 2 MB, el servidor declara 2\.5 MB\)/)
})

test('PDF original demasiado grande: límite de 15 MB y mensaje propio', async () => {
  let calls = 0
  const service = client(async () => {
    calls++
    return calls === 1
      ? new Response(JSON.stringify({ data: { order: { id: 345, status: 'dispatch', dispatch_order_number: 4, order_number: 'ORD-1' } } }), { status: 200, headers: { 'content-type': 'application/json' } })
      : big(16 * MB, 'application/pdf')
  })
  await assert.rejects(() => service.downloadExact(input), /La respuesta del PDF original del despacho supera el tamaño permitido \(límite 15 MB, el servidor declara 16\.0 MB\)/)
})

test('sin content-length (streaming): también se corta y no inventa un tamaño declarado', async () => {
  const service = client(async () => big(17 * MB, 'application/json', false))
  await assert.rejects(() => service.downloadExact(input), err => { assert.match(err.message, /supera el tamaño permitido \(límite 16 MB\)\.$/); assert.ok(!/declara/.test(err.message)); return true })
})

test('respuestas dentro del límite siguen funcionando igual', async () => {
  const order = { id: 345, status: 'dispatch', dispatch_order_number: 4, order_number: 'ORD-1' }
  let calls = 0
  const service = client(async () => (++calls === 1
    ? new Response(JSON.stringify({ data: { order } }), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response('%PDF-1.4 contenido', { status: 200, headers: { 'content-type': 'application/pdf' } })))
  const pdf = await service.downloadExact(input)
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
})

test('detalle de un pedido grande (5 MB, como el despacho 4) ya se acepta; el listado sigue limitado a 2 MB', async () => {
  const order = { id: 345, status: 'dispatch', dispatch_order_number: 4, order_number: 'ORD-1' }
  const heavy = JSON.stringify({ data: { order, productsAndCodeFiltered: 'x'.repeat(5 * MB) } })
  let calls = 0
  const service = client(async () => (++calls === 1
    ? new Response(heavy, { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response('%PDF-1.4 ok', { status: 200, headers: { 'content-type': 'application/pdf' } })))
  assert.equal((await service.downloadExact(input)).subarray(0, 5).toString(), '%PDF-')
  const listing = client(async () => big(3 * MB))
  await assert.rejects(() => listing.search(input, '2026-11-10'), /listado de despachos supera el tamaño permitido \(límite 2 MB/)
})
