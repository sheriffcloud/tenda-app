/**
 * `transactionFailureMessage` exists because a browser wallet rejects with a
 * plain JSON-RPC object, not an `Error` — so the cases that matter are the
 * non-Error ones `errorMessage` refuses, and the wire-envelope case it must
 * GO ON refusing.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { transactionFailureMessage } from '../../src/wallet/provider-error'

describe('transactionFailureMessage', () => {
  test('an EIP-1193 provider object answers with its reason', () => {
    // The measured shape: this is what "Transaction failed, please try again"
    // was being shown instead of.
    assert.equal(
      transactionFailureMessage({
        code: -32000,
        message: 'insufficient funds for gas * price + value',
      }),
      'insufficient funds for gas * price + value',
    )
  })

  test("a user rejection answers with the wallet's own words", () => {
    assert.equal(
      transactionFailureMessage({ code: 4001, message: 'User rejected the request.' }),
      'User rejected the request.',
    )
  })

  test('a WRAPPED provider error answers with the inner reason, not the wrapper', () => {
    // MetaMask's shape: the outer sentence is useless, the answer is in `data`.
    assert.equal(
      transactionFailureMessage({
        code: -32603,
        message: 'Internal JSON-RPC error.',
        data: { code: -32000, message: 'execution reverted: NotCreator' },
      }),
      'execution reverted: NotCreator',
    )
  })

  test('an Error still answers with its own words', () => {
    assert.equal(transactionFailureMessage(new Error('Escrow already accepted')), 'Escrow already accepted')
  })

  test('an Error that is ALSO a provider error prefers the nested reason', () => {
    // viem/ethers raise Error subclasses carrying the JSON-RPC fields. Reading
    // `.message` first would show the library's wrapper line.
    class RpcError extends Error {
      code = -32603
      data = { code: -32000, message: 'nonce too low' }
    }
    assert.equal(transactionFailureMessage(new RpcError('Internal JSON-RPC error.')), 'nonce too low')
  })

  test('a wire envelope is STILL refused — its `code` is a string ErrorCode', () => {
    // The guarantee errorMessage's own suite pins: a deserialised server
    // payload must never reach a toast. The numeric-code discriminator is what
    // keeps that true while admitting provider errors.
    assert.equal(
      transactionFailureMessage({ code: 'ESCROW_WRONG_STATUS', message: 'internal stack trace' }),
      '',
    )
  })

  test('a plain object with no code at all is refused', () => {
    assert.equal(transactionFailureMessage({ message: 'internal stack trace' }), '')
  })

  test('a provider error with no message answers blank, so the caller falls back', () => {
    assert.equal(transactionFailureMessage({ code: 4001 }), '')
  })

  test('null and undefined do not throw — this runs INSIDE a failure handler', () => {
    assert.equal(transactionFailureMessage(null), '')
    assert.equal(transactionFailureMessage(undefined), '')
  })

  test('a thrown string is not mistaken for copy', () => {
    assert.equal(transactionFailureMessage('boom'), '')
  })

  test('a CYCLIC provider error terminates instead of blowing the stack', () => {
    // The depth cap's reason for existing: recursing into `data` forever would
    // crash the handler that is reporting the failure.
    const cyclic: Record<string, unknown> = { code: -32603, message: 'wrapper' }
    cyclic.data = cyclic
    assert.equal(transactionFailureMessage(cyclic), 'wrapper')
  })

  test('nesting deeper than the cap falls back to the outermost message it can read', () => {
    const deep = { code: 1, message: 'l0', data: { code: 1, message: 'l1', data: { code: 1, message: 'l2', data: { code: 1, message: 'l3', data: { code: 1, message: 'l4', data: { code: 1, message: 'too deep' } } } } } }
    assert.equal(transactionFailureMessage(deep), 'l4')
  })
})
