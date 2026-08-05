import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const HASH = /^[a-f0-9]{40}$/

export class AdminDeployBroker {
  constructor({ sourceRoot, targetRoot, backupRoot, manifest, operations }) {
    this.sourceRoot = sourceRoot
    this.targetRoot = targetRoot
    this.backupRoot = backupRoot
    this.manifest = [...manifest]
    this.operations = operations
    this.locked = false
  }

  async deploy(sourceHash) {
    if (!HASH.test(String(sourceHash || ''))) throw Object.assign(new Error('Invalid deploy source hash.'), { status: 400 })
    if (this.locked) throw Object.assign(new Error('Admin deploy already running.'), { status: 409 })
    this.locked = true
    const runId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    const backup = path.join(this.backupRoot, `${runId}.tar.gz`)
    try {
      const state = await this.operations.inspect(this.sourceRoot)
      if (state.hash !== sourceHash || state.branch !== 'main' || state.clean !== true) throw Object.assign(new Error('Deploy source is not the exact clean main hash.'), { status: 409 })
      for (const file of this.manifest) await this.operations.check(path.join(this.sourceRoot, file))
      await fs.mkdir(this.backupRoot, { recursive: true })
      await this.operations.backup(this.targetRoot, this.manifest, backup)
      try {
        await this.operations.copy(this.sourceRoot, this.targetRoot, this.manifest)
        await this.operations.restart()
        await this.operations.health()
      } catch {
        await this.operations.restore(this.targetRoot, backup)
        await this.operations.restart()
        await this.operations.health()
        throw new Error('Admin deploy failed; rollback restored and verified.')
      }
      await fs.writeFile(`${backup}.json`, JSON.stringify({ sourceHash, result: 'success' }), { mode: 0o600 })
      return { ok: true, sourceHash, backupId: path.basename(backup), health: 'ok' }
    } finally {
      this.locked = false
    }
  }
}
