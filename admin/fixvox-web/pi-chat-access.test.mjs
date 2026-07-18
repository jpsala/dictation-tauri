import assert from 'node:assert/strict'
import test from 'node:test'
import { PiChatAccessCoordinator, piChatSessionKey } from './pi-chat-access.mjs'

test('Pi Chat serializes prompts and does not leak raw session identity', () => {
  const access = new PiChatAccessCoordinator()
  const a = piChatSessionKey({ headers: { cookie: 'fixvox_admin_session=session-a' } }, {})
  const b = piChatSessionKey({ headers: { cookie: 'fixvox_admin_session=session-b' } }, {})
  assert.notEqual(a, b)
  assert.doesNotMatch(a, /session-a/)
  access.beginPrompt(a)
  assert.throws(() => access.beginPrompt(b), (error) => error.status === 409)
  access.endPrompt(a)
  assert.doesNotThrow(() => access.beginPrompt(b))
})

test('confirmation is session-bound, expiring and one-time', () => {
  let now = 1000
  const event = { type: 'extension_ui_request', method: 'confirm', id: 'confirm-1', params: { message: 'write exact file' } }
  const access = new PiChatAccessCoordinator({ now: () => now, ttlMs: 100 })
  access.registerConfirmation(event, 'owner-a')
  assert.throws(() => access.consumeConfirmation('confirm-1', 'owner-b'), (error) => error.status === 403)
  access.registerConfirmation(event, 'owner-a')
  const accepted = access.consumeConfirmation('confirm-1', 'owner-a')
  assert.equal(accepted.operationHash.length, 64)
  assert.throws(() => access.consumeConfirmation('confirm-1', 'owner-a'), (error) => error.status === 403)
  access.registerConfirmation(event, 'owner-a')
  now = 1200
  assert.throws(() => access.consumeConfirmation('confirm-1', 'owner-a'), (error) => error.status === 403)
})
