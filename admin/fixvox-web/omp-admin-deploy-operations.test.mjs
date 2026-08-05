import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ADMIN_DEPLOY_MANIFEST, createAdminDeployOperations } from './omp-admin-deploy-operations.mjs'

test('first cutover backs up existing paths, records absent paths, and removes only cutover-created files on rollback', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-deploy-operations-'))
  const targetRoot = path.join(temp, 'target')
  const backup = path.join(temp, 'backup.tar.gz')
  const existing = ['server.mjs', 'public/app.js']
  const absent = ADMIN_DEPLOY_MANIFEST.filter((relative) => !existing.includes(relative))
  const archived = new Map()
  const tarCalls = []
  const filesystem = {
    access: fs.access,
    chmod: async () => {},
    chown: async () => {},
    copyFile: fs.copyFile,
    lstat: fs.lstat,
    mkdir: fs.mkdir,
    readFile: fs.readFile,
    rename: fs.rename,
    unlink: fs.unlink,
    writeFile: fs.writeFile,
  }
  const run = async (file, args) => {
    assert.equal(file, '/usr/bin/tar')
    tarCalls.push(args)
    const root = args[args.indexOf('-C') + 1]
    if (args[0] === '-czf') {
      const entries = args.slice(args.indexOf('-C') + 2)
      for (const relative of entries) archived.set(relative, await fs.readFile(path.join(root, relative), 'utf8'))
      await fs.writeFile(args[1], 'fake tar archive')
      return
    }
    assert.equal(args[0], '-xzf')
    for (const [relative, contents] of archived) {
      const target = path.join(root, relative)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, contents)
    }
  }
  const operations = createAdminDeployOperations({ sourceRoot: temp, adminHome: temp, adminUid: 1000, adminGid: 1000 }, { filesystem, run })

  try {
    for (const relative of existing) {
      const target = path.join(targetRoot, relative)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, `before:${relative}`)
    }

    await operations.backup(targetRoot, ADMIN_DEPLOY_MANIFEST, backup)

    const backupStateRaw = await fs.readFile(`${backup}.manifest.json`, 'utf8')
    const backupState = JSON.parse(backupStateRaw)
    assert.deepEqual(backupState, { version: 1, existing, absent })
    assert.doesNotMatch(backupStateRaw, new RegExp(targetRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.deepEqual(tarCalls[0].slice(tarCalls[0].indexOf('-C') + 2), existing)

    for (const relative of ADMIN_DEPLOY_MANIFEST) {
      const target = path.join(targetRoot, relative)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, `cutover:${relative}`)
    }
    const unrelated = path.join(targetRoot, 'public', 'unrelated.txt')
    await fs.writeFile(unrelated, 'keep me')

    await operations.restore(targetRoot, backup)

    for (const relative of existing) assert.equal(await fs.readFile(path.join(targetRoot, relative), 'utf8'), `before:${relative}`)
    for (const relative of absent) await assert.rejects(() => fs.readFile(path.join(targetRoot, relative)), (error) => error.code === 'ENOENT')
    assert.equal(await fs.readFile(unrelated, 'utf8'), 'keep me')
    assert.deepEqual(tarCalls[1], ['-xzf', backup, '-C', targetRoot])
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
})
