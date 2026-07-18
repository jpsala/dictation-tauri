import crypto from 'node:crypto'

export class PiChatAccessCoordinator {
  constructor({ now = () => Date.now(), ttlMs = 65_000 } = {}) {
    this.now = now
    this.ttlMs = ttlMs
    this.activeSession = null
    this.pending = new Map()
  }

  beginPrompt(sessionKey) {
    if (this.activeSession) throw Object.assign(new Error('Pi Chat is busy with another request.'), { status: 409 })
    this.activeSession = sessionKey
  }

  endPrompt(sessionKey) {
    if (this.activeSession === sessionKey) this.activeSession = null
  }

  cancelAll() {
    this.activeSession = null
    this.pending.clear()
  }

  registerConfirmation(event, sessionKey) {
    if (event?.type !== 'extension_ui_request' || !event?.method || !event.id) return
    const operationHash = crypto.createHash('sha256').update(JSON.stringify(event.params || event.message || event.id)).digest('hex')
    this.pending.set(String(event.id), { sessionKey, operationHash, expiresAt: this.now() + this.ttlMs })
  }

  consumeConfirmation(id, sessionKey) {
    const key = String(id || '')
    const pending = this.pending.get(key)
    this.pending.delete(key)
    if (!pending || pending.sessionKey !== sessionKey || pending.expiresAt <= this.now()) {
      throw Object.assign(new Error('Confirmation is invalid, expired, reused, or belongs to another session.'), { status: 403 })
    }
    return pending
  }
}

export function piChatSessionKey(req, principal) {
  const cookie = req.headers.cookie || ''
  const token = cookie.match(/(?:^|;\s*)fixvox_admin_session=([^;]+)/)?.[1]
  const identity = token || principal?.sub || principal?.email
  if (!identity) throw Object.assign(new Error('Authenticated session required.'), { status: 403 })
  return crypto.createHash('sha256').update(String(identity)).digest('hex')
}
