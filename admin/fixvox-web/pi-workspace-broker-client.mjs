import http from 'node:http'

function request(socketPath, route, body, signal) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path: route, method: 'POST', headers: { 'content-type': 'application/json' }, signal }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        let payload
        try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return reject(new Error('Workspace broker returned invalid JSON.')) }
        if (res.statusCode !== 200 || !payload.ok) return reject(new Error(payload.error || `Workspace broker failed (${res.statusCode}).`))
        resolve(payload)
      })
    })
    req.on('error', reject)
    req.end(JSON.stringify(body))
  })
}

export function createBrokerOperations(socketPath) {
  const call = (route, body, signal) => request(socketPath, route, body, signal)
  const readFile = async (file) => Buffer.from((await call('/v1/read', { path: file })).content, 'base64')
  const access = async (file) => { await call('/v1/access', { path: file }) }
  return {
    read: { readFile, access },
    write: {
      writeFile: async (file, content) => { await call('/v1/write', { path: file, content }) },
      mkdir: async (dir) => { await call('/v1/mkdir', { path: dir }) },
    },
    edit: {
      readFile,
      access,
      writeFile: async (file, content) => { await call('/v1/write', { path: file, content }) },
    },
    bash: {
      exec: async (command, cwd, { onData, signal, timeout }) => {
        const result = await call('/v1/bash', { command, cwd, timeout }, signal)
        if (result.output) onData(Buffer.from(result.output, 'base64'))
        return { exitCode: result.exitCode }
      },
    },
  }
}
