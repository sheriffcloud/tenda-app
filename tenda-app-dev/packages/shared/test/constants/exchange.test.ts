import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EXCHANGE_DISPUTE_REASON_MIN_LENGTH,
  EXCHANGE_DISPUTE_REASON_MAX_LENGTH,
  DISPUTE_MESSAGE_MAX_LENGTH,
  EXCHANGE_PAYMENT_WINDOW_MIN_SECONDS,
  EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS,
  EXCHANGE_PAYMENT_WINDOW_MAX_SECONDS,
  EXCHANGE_MAX_FIAT_AMOUNT,
  EXCHANGE_MAX_RATE,
} from '../../src/constants/exchange'

test('dispute reason length bounds are ordered and positive', () => {
  assert.ok(EXCHANGE_DISPUTE_REASON_MIN_LENGTH > 0)
  assert.ok(EXCHANGE_DISPUTE_REASON_MAX_LENGTH > EXCHANGE_DISPUTE_REASON_MIN_LENGTH)
  assert.ok(DISPUTE_MESSAGE_MAX_LENGTH > 0)
})

test('payment-window bounds: min <= default <= max', () => {
  assert.ok(EXCHANGE_PAYMENT_WINDOW_MIN_SECONDS <= EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS)
  assert.ok(EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS <= EXCHANGE_PAYMENT_WINDOW_MAX_SECONDS)
})

test('offer-term ceilings are positive', () => {
  assert.ok(EXCHANGE_MAX_FIAT_AMOUNT > 0)
  assert.ok(EXCHANGE_MAX_RATE > 0)
})
