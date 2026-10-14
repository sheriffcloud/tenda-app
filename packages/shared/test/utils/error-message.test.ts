/**
 * `errorMessage` exists because the cast it replaces CRASHES the handler it
 * sits in, so the cases that matter are the non-Error ones — the values a
 * `catch` can legally receive and an `as Error` cannot survive.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { errorMessage } from '../../src/utils/error-message'

describe('errorMessage', () => {
  test('an Error answers with its own words', () => {
    assert.equal(errorMessage(new Error('Escrow already accepted')), 'Escrow already accepted')
  })

  test('an Error SUBCLASS answers too — the wire errors are all subclasses', () => {
    class Apiish extends Error {}
    assert.equal(errorMessage(new Apiish('403 Forbidden')), '403 Forbidden')
  })

  test('a blank message stays blank, so the caller can fall back', () => {
    // Not the same as "no message": the caller's `|| fallback` handles both,
    // and it can only do that if this returns a falsy string rather than
    // inventing one.
    assert.equal(errorMessage(new Error('')), '')
  })

  test('null does not throw — this is the case the cast died on', () => {
    assert.equal(errorMessage(null), '')
  })

  test('undefined does not throw either', () => {
    assert.equal(errorMessage(undefined), '')
  })

  test('a thrown string has no `.message`, and is not mistaken for one', () => {
    // `throw 'boom'` is legal. Returning the string itself would be a guess
    // about whether it was meant as user-facing copy; it was not.
    assert.equal(errorMessage('boom'), '')
  })

  test('a plain object carrying a message field is NOT an Error', () => {
    // A wire envelope deserialised from JSON looks like this. It is not an
    // Error, and treating it as one is how a raw server payload reaches a toast.
    assert.equal(errorMessage({ message: 'internal stack trace' }), '')
  })
})
