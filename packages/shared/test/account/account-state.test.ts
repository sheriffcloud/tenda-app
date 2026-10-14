/**
 * The registry and the generation counter, which answer two different
 * questions and must keep answering them separately.
 *
 * The counter is module state, so ORDER MATTERS between cases here: each one
 * takes its own `accountGeneration()` snapshot rather than assuming a starting
 * value, which is also how a caller must use it.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  accountGeneration,
  beginAccountSession,
  clearAccountState,
  isSameAccount,
  registerAccountReset,
  resetAccountStateRegistryForTests,
} from '../../src/account'

beforeEach(() => {
  resetAccountStateRegistryForTests()
})

test('a registered reset runs on clear', () => {
  let ran = 0
  registerAccountReset(() => {
    ran += 1
  })

  clearAccountState()

  assert.equal(ran, 1)
})

test('every registration runs, not just the first', () => {
  const ran: string[] = []
  registerAccountReset(() => ran.push('a'))
  registerAccountReset(() => ran.push('b'))
  registerAccountReset(() => ran.push('c'))

  clearAccountState()

  assert.deepEqual(ran, ['a', 'b', 'c'])
})

test('an UNregistered module is not cleared — registration is what opts in', () => {
  let ran = 0
  const unregistered = (): void => {
    ran += 1
  }
  void unregistered

  clearAccountState()

  assert.equal(ran, 0)
})

test('the generation holds while nothing happens', () => {
  const gen = accountGeneration()

  assert.equal(isSameAccount(gen), true)
})

test('a clear moves the generation, so a snapshot taken before it is stale', () => {
  const gen = accountGeneration()

  clearAccountState()

  assert.equal(isSameAccount(gen), false)
})

test('beginAccountSession moves the generation WITHOUT clearing', () => {
  // The sign-IN case: there is nothing left to empty, but a request issued
  // during the signed-out window must not write into the session that follows.
  let ran = 0
  registerAccountReset(() => {
    ran += 1
  })
  const gen = accountGeneration()

  beginAccountSession()

  assert.equal(isSameAccount(gen), false)
  assert.equal(ran, 0)
})

test('the bump happens BEFORE the resets, so a reset already sees itself as stale', () => {
  // Not a detail: a reset that kicks off its own work, or a response landing
  // while the loop is still running, must find the generation already moved.
  // If the bump came last there would be a window in which a guard checking
  // mid-clear would answer "same account" and let the write through.
  let observedInsideReset: boolean | null = null
  const gen = accountGeneration()
  registerAccountReset(() => {
    observedInsideReset = isSameAccount(gen)
  })

  clearAccountState()

  assert.equal(observedInsideReset, false)
})

test('two transitions in a row are two distinct generations', () => {
  const first = accountGeneration()
  clearAccountState()
  const second = accountGeneration()
  beginAccountSession()

  assert.equal(isSameAccount(first), false)
  assert.equal(isSameAccount(second), false)
  assert.notEqual(first, second)
})

test('a stale snapshot never becomes current again', () => {
  // The counter only ever increases, so a guard cannot be fooled by a
  // wrap-around back onto an old value.
  const gen = accountGeneration()
  for (let i = 0; i < 5; i += 1) clearAccountState()

  assert.equal(isSameAccount(gen), false)
  assert.ok(accountGeneration() > gen)
})

test('the test seam forgets registrations, so one suite cannot clear another\'s state', () => {
  let ran = 0
  registerAccountReset(() => {
    ran += 1
  })

  resetAccountStateRegistryForTests()
  clearAccountState()

  assert.equal(ran, 0)
})
