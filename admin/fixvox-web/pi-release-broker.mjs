#!/usr/bin/env node
import crypto from 'node:crypto'
import http from 'node:http'

const OPERATIONS = new Set(['git_commit', 'git_push', 'deploy'])
const SENSITIVE_PATH = /(^|\/)(\.env($|\.)|auth\.json$|credentials?($|\.)|sessions?\/|stores?\/|private-exports?\/|[^/]+\.(sqlite|sqlite3|db)$)/i

export class ReleaseBroker {
  constructor({ repositories, recipes = {}, runner, now = () => Date.now(), ttlMs = 60_000, journal = async () => {} }) {
    this.repositories = repositories
    this.recipes = recipes
    this.runner = runner
    this.now = now
    this.ttlMs = ttlMs
    this.journal = journal
    this.pending = new Map()
    this.locks = new Set()
  }

  async inspect(repoId, operation = 'status') {
    const repo = this.repositories[repoId]
    if (!repo) throw Object.assign(new Error('Unknown release repository.'), { status: 404 })
    const state = await this.runner.inspect(repo, { refreshRemote: operation === 'git_push' || operation === 'deploy' })
    if (state.branch !== repo.branch || state.remoteName !== repo.remoteName || state.remoteMatches !== true) {
      throw Object.assign(new Error('Repository branch or remote does not match release policy.'), { status: 409 })
    }
    if ([...(state.untracked || []), ...(state.changedFiles || [])].some((file) => SENSITIVE_PATH.test(file))) {
      throw Object.assign(new Error('Sensitive changed path blocks release operations.'), { status: 409 })
    }
    return { repo, state }
  }

  async status(repoId) {
    const { repo, state } = await this.inspect(repoId, 'git_push')
    return { repoId: repo.id, branch: state.branch, head: state.head, dirty: state.dirty, changedCount: Number(state.changedCount || 0), untrackedCount: (state.untracked || []).length, fastForward: state.fastForward === true }
  }

  async diff(repoId) {
    const { repo } = await this.inspect(repoId)
    const text = String(await this.runner.diff(repo))
    if (text.length > 64 * 1024) throw Object.assign(new Error('Diff exceeds release broker limit.'), { status: 413 })
    return { repoId: repo.id, diff: text }
  }

  async prepare(input) {
    const operation = String(input.operation || '')
    if (!OPERATIONS.has(operation)) throw Object.assign(new Error('Unknown release operation.'), { status: 400 })
    const { repo, state } = await this.inspect(String(input.repoId || ''), operation)
    if (this.locks.has(repo.id) || [...this.pending.values()].some((item) => item.repoId === repo.id && item.expiresAt > this.now())) {
      throw Object.assign(new Error('Another mutation is pending for this repository.'), { status: 409 })
    }
    if (operation === 'git_commit' && state.dirty !== true) throw Object.assign(new Error('Nothing to commit.'), { status: 409 })
    if (operation !== 'git_commit' && state.dirty === true) throw Object.assign(new Error('Repository must be clean.'), { status: 409 })
    if (operation === 'git_push' && state.fastForward !== true) throw Object.assign(new Error('Push is not fast-forward.'), { status: 409 })
    let target = `${repo.id}/${repo.branch}`
    let expectedHash = state.head
    if (operation === 'deploy') {
      const recipe = this.recipes[input.recipeId]
      if (!recipe || recipe.enabled !== true || recipe.repoId !== repo.id) throw Object.assign(new Error('Unknown or disabled deploy recipe.'), { status: 404 })
      if (state.pushedHash !== state.head) throw Object.assign(new Error('Deploy requires the exact pushed hash.'), { status: 409 })
      target = recipe.target
      expectedHash = state.pushedHash
    }
    const verb = operation === 'git_commit' ? 'COMMIT' : operation === 'git_push' ? 'PUSH' : 'DEPLOY'
    const phrase = `${verb} ${target} ${expectedHash.slice(0, 12)}`
    const id = crypto.randomUUID()
    const operationHash = crypto.createHash('sha256').update(JSON.stringify({ operation, repoId: repo.id, target, expectedHash })).digest('hex')
    const message = String(input.message || '').trim()
    if (operation === 'git_commit' && (!message || message.length > 120 || /[\r\n]/.test(message))) throw Object.assign(new Error('Commit message is invalid.'), { status: 400 })
    this.pending.set(id, { id, operation, repoId: repo.id, recipeId: input.recipeId, message, phrase, operationHash, expectedHash, target, expiresAt: this.now() + this.ttlMs })
    return { id, operation, repoId: repo.id, target, sourceHash: expectedHash, phrase, operationHash, expiresAt: this.now() + this.ttlMs }
  }

  async execute({ id, confirmation }) {
    const pending = this.pending.get(String(id || ''))
    this.pending.delete(String(id || ''))
    if (!pending || pending.expiresAt <= this.now() || confirmation !== pending.phrase) {
      throw Object.assign(new Error('Release confirmation is invalid, expired, or already used.'), { status: 403 })
    }
    if (this.locks.has(pending.repoId)) throw Object.assign(new Error('Repository mutation already running.'), { status: 409 })
    this.locks.add(pending.repoId)
    try {
      const { repo, state } = await this.inspect(pending.repoId, pending.operation)
      if (state.head !== pending.expectedHash) throw Object.assign(new Error('Repository changed after confirmation.'), { status: 409 })
      let result
      if (pending.operation === 'git_commit') result = await this.runner.commit(repo, pending.message)
      else if (pending.operation === 'git_push') result = await this.runner.push(repo, pending.expectedHash)
      else result = await this.runner.deploy(this.recipes[pending.recipeId], pending.expectedHash)
      await this.journal({ at: new Date(this.now()).toISOString(), operation: pending.operation, repoId: pending.repoId, target: pending.target, operationHash: pending.operationHash, sourceHash: pending.expectedHash, result: 'success' })
      return { ok: true, operation: pending.operation, repoId: pending.repoId, target: pending.target, sourceHash: pending.expectedHash, result }
    } catch (error) {
      await this.journal({ at: new Date(this.now()).toISOString(), operation: pending.operation, repoId: pending.repoId, target: pending.target, operationHash: pending.operationHash, sourceHash: pending.expectedHash, result: 'failed' })
      throw error
    } finally {
      this.locks.delete(pending.repoId)
    }
  }
}

export function createReleaseBrokerServer(broker) {
  return http.createServer(async (request, response) => {
    try {
      if (request.method !== 'POST') throw Object.assign(new Error('Method not allowed.'), { status: 405 })
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      const payload = request.url === '/v1/status' ? await broker.status(String(input.repoId || '')) : request.url === '/v1/diff' ? await broker.diff(String(input.repoId || '')) : request.url === '/v1/prepare' ? await broker.prepare(input) : request.url === '/v1/execute' ? await broker.execute(input) : null
      if (!payload) throw Object.assign(new Error('Unknown release route.'), { status: 404 })
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: true, ...payload }))
    } catch (error) {
      response.writeHead(error.status || 500, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: false, error: error.message || 'Release broker error.' }))
    }
  })
}

export function sensitiveReleasePath(value) { return SENSITIVE_PATH.test(String(value || '').replaceAll('\\', '/')) }
