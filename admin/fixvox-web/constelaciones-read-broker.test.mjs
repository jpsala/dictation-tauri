import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { createConstelacionesReadBroker } from './constelaciones-read-broker.mjs'

test('Constelaciones broker returns only bounded future appointment projection', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'constelaciones-broker-'))
  const dbPath = path.join(temp, 'test.sqlite')
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE availability_slots (id TEXT, location_text TEXT); CREATE TABLE appointments (id TEXT, slot_id TEXT, starts_at TEXT, ends_at TEXT, status TEXT, client_name TEXT, client_phone TEXT, notes TEXT);')
  db.prepare('INSERT INTO availability_slots VALUES (?, ?)').run('slot-secret', 'Mar del Plata')
  db.prepare('INSERT INTO appointments VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('appt-secret', 'slot-secret', '2026-07-20T10:00', '2026-07-20T11:00', 'confirmed', 'Person Secret', '+54000', 'private note')
  db.close()
  const socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\constelaciones-${process.pid}-${Date.now()}` : path.join(temp, 'broker.sock')
  const server = createConstelacionesReadBroker({ dbPath, now: () => new Date('2026-07-18T00:00:00.000Z') })
  server.listen(socketPath); await once(server, 'listening')
  try {
    const payload = await new Promise((resolve, reject) => {
      const req = http.request({ socketPath, path: '/v1/appointments/future?days=30' }, (res) => { const chunks=[]; res.on('data', c=>chunks.push(c)); res.on('end',()=>resolve(JSON.parse(Buffer.concat(chunks)))) }); req.on('error', reject); req.end()
    })
    const serialized = JSON.stringify(payload)
    assert.deepEqual(payload.rows, [{ startsAt: '2026-07-20T10:00', endsAt: '2026-07-20T11:00', status: 'confirmed', location: 'Mar del Plata' }])
    assert.doesNotMatch(serialized, /slot-secret|appt-secret|Person Secret|\+54000|private note/)
  } finally { server.close(); await once(server, 'close'); await fs.rm(temp, { recursive: true, force: true }) }
})
