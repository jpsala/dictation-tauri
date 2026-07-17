import crypto from 'node:crypto'

export function accountHandleForGoogleSubject(subject) {
  const value = String(subject || '').trim()
  if (!value) return null
  const digest = crypto.createHash('sha256').update(`google:${value}`).digest('hex')
  return `acc_${digest.slice(0, 16)}`
}

export function annotateCurrentAdminAccount(payload, session) {
  const accounts = Array.isArray(payload?.accounts) ? payload.accounts.map(redactAccountRecord) : []
  const accountHandle = session?.provider === 'google'
    ? accountHandleForGoogleSubject(session.sub)
    : null
  if (!accountHandle) return { ...payload, accounts, currentAccount: null }

  const displayName = String(session.name || 'Cuenta Google').trim() || 'Cuenta Google'
  const userEmailRedacted = redactGoogleEmail(session.email)
  let linked = false
  const annotatedAccounts = accounts.map((account) => {
    if (account?.accountHandle !== accountHandle) return account
    linked = true
    return {
      ...account,
      isCurrentAccount: true,
      displayName,
      userEmailRedacted,
    }
  })

  return {
    ...payload,
    accounts: annotatedAccounts,
    currentAccount: { linked, displayName, userEmailRedacted },
  }
}

function redactAccountRecord(account) {
  if (!account || typeof account !== 'object') return account
  const safe = { ...account }
  if (Object.hasOwn(safe, 'userEmail')) safe.userEmail = null
  for (const key of ['accountId', 'googleSubject', 'subject']) delete safe[key]
  return safe
}

export function redactGoogleEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  const [name, domain] = email.split('@')
  if (!name || !domain) return null
  return `${name.slice(0, 1)}…@${domain}`
}
