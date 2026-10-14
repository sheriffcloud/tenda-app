/**
 * utils/transaction-gate, classification + routing for the Stage-9D
 * first-transaction gate (deferred wallet + verified contact).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  classifyTransactionGateError,
  TRANSACTION_GATE_MESSAGE,
  transactionGateRoute,
} from '../../../src/utils/escrow/transaction-gate'
import { ApiClientError } from '../../../src/api/client-error'

test('maps WALLET_REQUIRED + CONTACT_REQUIRED to gate reasons', () => {
  assert.strictEqual(
    classifyTransactionGateError(new ApiClientError(403, 'x', 'm', 'WALLET_REQUIRED')),
    'wallet_required',
  )
  assert.strictEqual(
    classifyTransactionGateError(new ApiClientError(403, 'x', 'm', 'CONTACT_REQUIRED')),
    'contact_required',
  )
})

test('returns null for other codes, code-less API errors, and non-API errors', () => {
  assert.strictEqual(classifyTransactionGateError(new ApiClientError(403, 'x', 'm', 'FORBIDDEN')), null)
  assert.strictEqual(classifyTransactionGateError(new ApiClientError(500, 'x', 'm')), null) // no code
  assert.strictEqual(classifyTransactionGateError(new Error('boom')), null)
  assert.strictEqual(classifyTransactionGateError(null), null)
})

test('a bare object wearing the code is not a gate — only the real envelope counts', () => {
  assert.strictEqual(
    classifyTransactionGateError({ code: 'WALLET_REQUIRED', statusCode: 403 }),
    null,
  )
})

test('routes wallet_required → linked-wallets and contact_required → security', () => {
  assert.strictEqual(transactionGateRoute('wallet_required'), '/settings/linked-wallets')
  assert.strictEqual(transactionGateRoute('contact_required'), '/settings/security')
})

test('has user-facing copy for every reason', () => {
  assert.match(TRANSACTION_GATE_MESSAGE.wallet_required, /wallet/i)
  assert.match(TRANSACTION_GATE_MESSAGE.contact_required, /email or phone/i)
})
