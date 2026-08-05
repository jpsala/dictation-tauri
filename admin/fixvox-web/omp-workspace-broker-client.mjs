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
  const readFile = async (file, signal) => Buffer.from((await call('/v1/read', { path: file }, signal)).content, 'base64')
  const access = async (file, signal) => { await call('/v1/access', { path: file }, signal) }
  const writeFile = async (file, content, signal) => { await call('/v1/write', { path: file, content }, signal) }
  return {
    read: { readFile, access },
    find: {
      exists: async (target, signal) => (await call('/v1/exists', { path: target }, signal)).exists,
      glob: async (pattern, cwd, options, signal) => (await call('/v1/glob', { pattern, cwd, ...options }, signal)).paths,
    },
    ls: {
      exists: async (target, signal) => (await call('/v1/exists', { path: target }, signal)).exists,
      stat: async (target, signal) => {
        const result = await call('/v1/stat', { path: target }, signal)
        return { isDirectory: () => result.directory }
      },
      readdir: async (target, limit, signal) => (await call('/v1/readdir', { path: target, limit }, signal)).entries,
    },
    grep: async (params, signal) => (await call('/v1/grep', params, signal)).matches,
    write: {
      writeFile,
      mkdir: async (dir, signal) => { await call('/v1/mkdir', { path: dir }, signal) },
    },
    edit: { readFile, access, writeFile },
    bash: {
      exec: async (command, cwd, { onData, signal, timeout }) => {
        const result = await call('/v1/bash', { command, cwd, timeout }, signal)
        if (result.output) onData(Buffer.from(result.output, 'base64'))
        return { exitCode: result.exitCode }
      },
    },
  }
}
