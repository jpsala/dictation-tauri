#!/usr/bin/env node
import http from 'node:http'

const socketPath = process.env.PI_ADMIN_DEPLOY_SOCKET
const index = process.argv.indexOf('--source-hash')
const sourceHash = index >= 0 ? process.argv[index + 1] : ''
if (!socketPath || !/^[a-f0-9]{40}$/.test(sourceHash)) throw new Error('Admin deploy client is not configured.')
const result = await new Promise((resolve, reject) => {
  const request = http.request({ socketPath, path: '/v1/deploy', method: 'POST', headers: { 'content-type': 'application/json' } }, (response) => {
    const chunks = []
    response.on('data', (chunk) => chunks.push(chunk))
    response.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (response.statusCode !== 200 || !payload.ok) return reject(new Error(payload.error || 'Admin deploy rejected.'))
        resolve(payload)
      } catch (error) { reject(error) }
    })
  })
  request.on('error', reject)
  request.end(JSON.stringify({ sourceHash }))
})
process.stdout.write(`${JSON.stringify({ ok: true, sourceHash: result.sourceHash, health: result.health })}\n`)
