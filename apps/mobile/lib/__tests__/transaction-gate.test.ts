/**
 * lib/transaction-gate, classification + routing for the Stage-9D
 * first-transaction gate (deferred wallet + verified contact).
 */

jest.mock('@/api/client', () => {
  // Mock class so the lib's `instanceof ApiClientError` resolves here too.
  class ApiClientError extends Error {
    statusCode: number
    code?: string
    constructor(statusCode: number, error: string, message: string, code?: string) {
      super(message)
      this.statusCode = statusCode
      this.code = code
    }
  }
  return { ApiClientError }
})

import {
  classifyTransactionGateError,
  TRANSACTION_GATE_MESSAGE,
  transactionGateRoute,
} from '@/lib/transaction-gate'
import { ApiClientError } from '@/api/client'

describe('classifyTransactionGateError', () => {
  it('maps WALLET_REQUIRED + CONTACT_REQUIRED to gate reasons', () => {
    expect(classifyTransactionGateError(new ApiClientError(403, 'x', 'm', 'WALLET_REQUIRED'))).toBe(
      'wallet_required',
    )
    expect(classifyTransactionGateError(new ApiClientError(403, 'x', 'm', 'CONTACT_REQUIRED'))).toBe(
      'contact_required',
    )
  })

  it('returns null for other codes, code-less API errors, and non-API errors', () => {
    expect(classifyTransactionGateError(new ApiClientError(403, 'x', 'm', 'FORBIDDEN'))).toBeNull()
    expect(classifyTransactionGateError(new ApiClientError(500, 'x', 'm'))).toBeNull() // no code
    expect(classifyTransactionGateError(new Error('boom'))).toBeNull()
    expect(classifyTransactionGateError(null)).toBeNull()
  })
})

describe('transactionGateRoute', () => {
  it('routes wallet_required → linked-wallets and contact_required → security', () => {
    expect(transactionGateRoute('wallet_required')).toBe('/settings/linked-wallets')
    expect(transactionGateRoute('contact_required')).toBe('/settings/security')
  })
})

describe('TRANSACTION_GATE_MESSAGE', () => {
  it('has user-facing copy for every reason', () => {
    expect(TRANSACTION_GATE_MESSAGE.wallet_required).toMatch(/wallet/i)
    expect(TRANSACTION_GATE_MESSAGE.contact_required).toMatch(/email or phone/i)
  })
})
