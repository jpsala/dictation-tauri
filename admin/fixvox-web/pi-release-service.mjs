#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { ReleaseBroker, createReleaseBrokerServer } from './pi-release-broker.mjs'
import { createGitReleaseRunner } from './pi-release-git-runner.mjs'

const enabled = process.env.PI_CHAT_RELEASE_BROKER_ENABLED === '1'
const socketPath = process.env.PI_CHAT_RELEASE_BROKER_SOCKET
const configPath = process.env.PI_CHAT_RELEASE_CONFIG
const journalPath = process.env.PI_CHAT_RELEASE_JOURNAL
if (!enabled) throw new Error('Release broker is disabled.')
if (!socketPath || !configPath || !journalPath) throw new Error('Release broker paths are not configured.')

let config
try { config = JSON.parse(await fs.readFile(configPath, 'utf8')) }
catch { throw new Error('Release broker config is invalid.') }
const journal = async (record) => {
  await fs.mkdir(path.dirname(journalPath), { recursive: true })
  await fs.appendFile(journalPath, `${JSON.stringify(record)}\n`, { mode: 0o600 })
}
const broker = new ReleaseBroker({ repositories: config.repositories, recipes: config.recipes, runner: createGitReleaseRunner(), journal })
await fs.rm(socketPath, { force: true })
const server = createReleaseBrokerServer(broker)
server.listen(socketPath, async () => {
  await fs.chmod(socketPath, 0o660)
  process.stdout.write('release broker ready\n')
})
