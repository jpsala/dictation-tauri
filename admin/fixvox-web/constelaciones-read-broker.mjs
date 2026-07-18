#!/usr/bin/env node
import fs from 'node:fs/promises'
import http from 'node:http'
import { DatabaseSync } from 'node:sqlite'

export function createConstelacionesReadBroker({ dbPath, now = () => new Date() }) {
  return http.createServer((request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://unix')
      if (request.method !== 'GET' || url.pathname !== '/v1/appointments/future') {
        response.writeHead(404, { 'content-type': 'application/json' })
        return response.end(JSON.stringify({ ok: false, error: 'Unknown read route.' }))
      }
      const days = Math.max(1, Math.min(120, Number(url.searchParams.get('days')) || 60))
      const from = now()
      const to = new Date(from.getTime() + days * 86_400_000)
      const db = new DatabaseSync(dbPath, { readOnly: true })
      let rows
      try {
        rows = db.prepare(`
          SELECT a.starts_at startsAt, a.ends_at endsAt,
            a.status status, s.location_text location
          FROM appointments a
          LEFT JOIN availability_slots s ON s.id = a.slot_id
          WHERE a.starts_at >= ? AND a.starts_at < ?
            AND a.status NOT IN ('cancelled', 'canceled')
          ORDER BY a.starts_at
          LIMIT 100
        `).all(from.toISOString(), to.toISOString())
      } finally { db.close() }
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      response.end(JSON.stringify({ ok: true, partial: false, rows }))
    } catch {
      response.writeHead(503, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: false, error: 'Appointment source unavailable.' }))
    }
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const socketPath = process.env.PI_CHAT_CONSTELACIONES_SOCKET
  const dbPath = process.env.CONSTELACIONES_READ_DB
  if (!socketPath || !dbPath) throw new Error('Broker socket and read database are required.')
  await fs.rm(socketPath, { force: true })
  const server = createConstelacionesReadBroker({ dbPath })
  server.listen(socketPath, async () => {
    await fs.chmod(socketPath, 0o660)
    process.stdout.write('constelaciones read broker ready\n')
  })
}
