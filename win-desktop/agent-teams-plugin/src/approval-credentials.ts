import { randomBytes } from 'node:crypto'

export interface ApprovalBinding {
  readonly workspace: string
  readonly captainSessionId: string
  readonly teamId: string
  readonly planRevision: number
}

export interface PreparedApprovalCredential {
  readonly token: string
  readonly receiptId: string
  readonly expiresAt: number
  readonly planRevision: number
}

export interface ConsumedApprovalCredential {
  readonly receiptId: string
}

export interface ApprovalCredentialStoreOptions {
  readonly now?: () => number
  readonly randomToken?: () => string
  readonly randomReceiptId?: () => string
  readonly ttlMs?: number
}

interface CredentialRecord extends ApprovalBinding {
  readonly receiptId: string
  readonly expiresAt: number
}

const INVALID_CREDENTIAL = 'approval credential invalid or already consumed'

function assertBinding(binding: ApprovalBinding): void {
  if (
    typeof binding !== 'object'
    || binding === null
    || typeof binding.workspace !== 'string'
    || binding.workspace.trim() === ''
    || typeof binding.captainSessionId !== 'string'
    || binding.captainSessionId.trim() === ''
    || typeof binding.teamId !== 'string'
    || binding.teamId.trim() === ''
    || !Number.isSafeInteger(binding.planRevision)
    || binding.planRevision <= 0
  ) throw new Error('approval binding is invalid')
}

function sameBinding(record: CredentialRecord, binding: ApprovalBinding): boolean {
  return (
    record.workspace === binding.workspace
    && record.captainSessionId === binding.captainSessionId
    && record.teamId === binding.teamId
    && record.planRevision === binding.planRevision
  )
}

export function createApprovalCredentialStore(options: ApprovalCredentialStoreOptions = {}) {
  const now = options.now ?? (() => Date.now())
  const randomToken = options.randomToken ?? (() => randomBytes(24).toString('base64url'))
  const randomReceiptId = options.randomReceiptId ?? (() => randomBytes(8).toString('hex'))
  const ttlMs = options.ttlMs ?? 120_000
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('approval credential TTL is invalid')

  const records = new Map<string, CredentialRecord>()
  const receiptExpiries = new Map<string, number>()

  function cleanupExpired(currentTime: number): void {
    for (const [token, record] of records) {
      if (currentTime > record.expiresAt) records.delete(token)
    }
    for (const [receiptId, expiresAt] of receiptExpiries) {
      if (currentTime > expiresAt) receiptExpiries.delete(receiptId)
    }
  }

  return {
    prepare(binding: ApprovalBinding): PreparedApprovalCredential {
      assertBinding(binding)
      const issuedAt = now()
      if (!Number.isFinite(issuedAt)) throw new Error('approval credential clock is invalid')
      cleanupExpired(issuedAt)
      const token = randomToken()
      const receiptId = randomReceiptId()
      if (typeof token !== 'string' || token === '' || typeof receiptId !== 'string' || receiptId === '') {
        throw new Error('approval credential factory is invalid')
      }
      if (records.has(token) || receiptExpiries.has(receiptId)) {
        throw new Error('approval credential factory is invalid')
      }
      const expiresAt = issuedAt + ttlMs
      if (!Number.isFinite(expiresAt)) throw new Error('approval credential TTL is invalid')
      records.set(token, { ...binding, receiptId, expiresAt })
      receiptExpiries.set(receiptId, expiresAt)
      return { token, receiptId, expiresAt, planRevision: binding.planRevision }
    },

    consume(input: ApprovalBinding & { readonly token: string }): ConsumedApprovalCredential {
      const token = input?.token
      const record = typeof token === 'string' ? records.get(token) : undefined
      if (typeof token === 'string') records.delete(token)
      const currentTime = now()
      if (Number.isFinite(currentTime)) cleanupExpired(currentTime)
      if (
        record === undefined
        || !Number.isFinite(currentTime)
        || currentTime > record.expiresAt
        || !isValidBinding(input)
        || !sameBinding(record, input)
      ) throw new Error(INVALID_CREDENTIAL)
      return { receiptId: record.receiptId }
    },
  }
}

function isValidBinding(binding: ApprovalBinding): boolean {
  try {
    assertBinding(binding)
    return true
  } catch {
    return false
  }
}
