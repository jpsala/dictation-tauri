import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { once } from 'node:events'
import { queryFutureAppointments, sanitizeFutureAppointments } from './constelaciones-read-adapter.mjs'

test('future appointments projection removes identities, IDs, notes, phones and payment data', () => {
  const result = sanitizeFutureAppointments({
    ok: true,
    rows: [{
      slot_id: 'slot-sensitive',
      appointment_id: 'appointment-sensitive',
      starts_at: '2026-07-24T16:00:00-03:00',
      ends_at: '2026-07-24T17:00:00-03:00',
      appointment_status: 'confirmed',
      client_name: 'Person Sensitive',
      client_phone: '+5400000000',
      notes: 'private note',
      balance_cents: 1000,
      location: 'Mar del Plata',
    }],
  }, new Date('2026-07-18T00:00:00.000Z'))
  const serialized = JSON.stringify(result)

  assert.deepEqual(result.appointments, [{
    startsAt: '2026-07-24T16:00:00-03:00',
    endsAt: '2026-07-24T17:00:00-03:00',
    status: 'confirmed',
    kind: undefined,
    location: 'Mar del Plata',
  }])
  assert.doesNotMatch(serialized, /slot-sensitive|appointment-sensitive|Person Sensitive|\+5400000000|private note|balance/i)
})

test('future appointments client uses one bounded read-only broker route', async () => {
  const socketPath = process.platform === 'win32'
    ? `\\\\.\\pipe\\fixvox-appointments-${process.pid}-${Date.now()}`
    : path.join(os.tmpdir(), `fixvox-appointments-${process.pid}-${Date.now()}.sock`)
  let observed
  const server = http.createServer((request, response) => {
    observed = { method: request.method, url: request.url }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true, rows: [{ startsAt: '2026-07-25T10:00:00-03:00', endsAt: '2026-07-25T11:00:00-03:00', status: 'confirmed' }] }))
  })
  server.listen(socketPath)
  await once(server, 'listening')
  try {
    const result = await queryFutureAppointments({ socketPath, days: 999 })
    assert.deepEqual(observed, { method: 'GET', url: '/v1/appointments/future?days=120' })
    assert.equal(result.count, 1)
    assert.equal(result.source, 'constelaciones-read-broker')
  } finally {
    server.close()
    await once(server, 'close')
  }
})
