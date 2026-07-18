import http from 'node:http'

function call(socketPath, route, body, signal) {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath, path: route, method: 'POST', headers: { 'content-type': 'application/json' }, signal }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        let payload
        try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return reject(new Error('Release broker returned invalid JSON.')) }
        if (response.statusCode !== 200 || !payload.ok) return reject(new Error(payload.error || 'Release broker rejected the operation.'))
        resolve(payload)
      })
    })
    request.on('error', reject)
    request.end(JSON.stringify(body))
  })
}

export function createReleaseBrokerClient(socketPath) {
  return {
    status: (repoId, signal) => call(socketPath, '/v1/status', { repoId }, signal),
    diff: (repoId, signal) => call(socketPath, '/v1/diff', { repoId }, signal),
    prepare: (input, signal) => call(socketPath, '/v1/prepare', input, signal),
    execute: (input, signal) => call(socketPath, '/v1/execute', input, signal),
  }
}
