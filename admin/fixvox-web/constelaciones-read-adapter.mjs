import http from 'node:http'

const MAX_RESPONSE_BYTES = 64 * 1024
const MAX_ROWS = 100

function boundedDays(value) {
  const number = Number(value ?? 60)
  if (!Number.isFinite(number)) return 60
  return Math.max(1, Math.min(120, Math.floor(number)))
}

export function sanitizeFutureAppointments(payload, now = new Date()) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : []
  const appointments = rows.slice(0, MAX_ROWS).map((row) => ({
    startsAt: String(row.startsAt || row.starts_at || ''),
    endsAt: String(row.endsAt || row.ends_at || ''),
    status: String(row.status || row.appointmentStatus || row.appointment_status || 'unknown'),
    kind: row.kind ? String(row.kind) : undefined,
    location: row.location ? String(row.location) : undefined,
  })).filter((row) => row.startsAt)
  return {
    ok: payload?.ok === true,
    verifiedAt: now.toISOString(),
    source: 'constelaciones-read-broker',
    partial: payload?.partial === true,
    count: appointments.length,
    appointments,
  }
}

export function queryFutureAppointments({ socketPath, days = 60, signal }) {
  if (!socketPath) return Promise.reject(new Error('Constelaciones read broker is not configured.'))
  const safeDays = boundedDays(days)
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      path: `/v1/appointments/future?days=${safeDays}`,
      method: 'GET',
      headers: { accept: 'application/json' },
      signal,
    }, (response) => {
      let bytes = 0
      const chunks = []
      response.on('data', (chunk) => {
        bytes += chunk.length
        if (bytes > MAX_RESPONSE_BYTES) {
          request.destroy(new Error('Constelaciones broker response exceeded the safe limit.'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        if ((response.statusCode || 500) !== 200) {
          reject(new Error(`Constelaciones broker unavailable (${response.statusCode || 500}).`))
          return
        }
        try {
          resolve(sanitizeFutureAppointments(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
        } catch {
          reject(new Error('Constelaciones broker returned invalid JSON.'))
        }
      })
    })
    request.on('error', reject)
    request.end()
  })
}
