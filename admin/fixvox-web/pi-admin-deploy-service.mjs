#!/usr/bin/env node
import fs from 'node:fs/promises'
import http from 'node:http'
import { AdminDeployBroker } from './pi-admin-deploy-broker.mjs'
import { ADMIN_DEPLOY_MANIFEST, createAdminDeployOperations } from './pi-admin-deploy-operations.mjs'

export function createAdminDeployServer(broker) {
  return http.createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || request.url !== '/v1/deploy') throw Object.assign(new Error('Unknown deploy route.'), { status: 404 })
      const chunks = []
      let bytes = 0
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 4096) throw Object.assign(new Error('Deploy request too large.'), { status: 413 }); chunks.push(chunk) }
      let body
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { throw Object.assign(new Error('Invalid deploy request.'), { status: 400 }) }
      if (Object.keys(body).some((key) => key !== 'sourceHash')) throw Object.assign(new Error('Caller-supplied deploy fields are forbidden.'), { status: 400 })
      const result = await broker.deploy(body.sourceHash)
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(result))
    } catch (error) {
      response.writeHead(error.status || 500, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: false, error: error.message || 'Admin deploy helper error.' }))
    }
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const socketPath = process.env.PI_ADMIN_DEPLOY_SOCKET
  const configPath = process.env.PI_ADMIN_DEPLOY_CONFIG
  if (!socketPath || !configPath) throw new Error('Admin deploy helper is not configured.')
  let config
  try { config = JSON.parse(await fs.readFile(configPath, 'utf8')) } catch { throw new Error('Admin deploy helper config is invalid.') }
  const broker = new AdminDeployBroker({ sourceRoot: config.sourceRoot, targetRoot: config.targetRoot, backupRoot: config.backupRoot, manifest: ADMIN_DEPLOY_MANIFEST, operations: createAdminDeployOperations(config) })
  await fs.rm(socketPath, { force: true })
  const server = createAdminDeployServer(broker)
  server.listen(socketPath, async () => {
    await fs.chmod(socketPath, 0o660)
    process.stdout.write('admin deploy helper ready\n')
  })
}
