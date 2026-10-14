import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getOfferMissingRequirement } from '../../../src/utils/exchange/offer-form'
import { EXCHANGE_MAX_FIAT_AMOUNT, EXCHANGE_MAX_RATE } from '../../../src/constants/exchange'

const VALID = { hasAsset: true, amountRaw: '1000000', rate: 1500, fiatTotal: 1500, hasPayoutAccount: true }

test('reports missing offer requirements in interaction order', () => {
  assert.equal(getOfferMissingRequirement({ ...VALID, hasAsset: false }), 'Choose an asset')
  assert.equal(getOfferMissingRequirement({ ...VALID, amountRaw: null }), 'Enter an amount')
  assert.equal(getOfferMissingRequirement({ ...VALID, amountRaw: '0' }), 'Enter an amount')
  assert.equal(getOfferMissingRequirement({ ...VALID, amountRaw: '9'.repeat(79) }), 'Enter a smaller amount')
  assert.equal(getOfferMissingRequirement({ ...VALID, rate: Number.NaN }), 'Set your rate')
  assert.equal(getOfferMissingRequirement({ ...VALID, rate: 0 }), 'Set your rate')
  assert.equal(getOfferMissingRequirement({ ...VALID, rate: EXCHANGE_MAX_RATE + 1 }), 'Enter a lower rate')
  assert.equal(
    getOfferMissingRequirement({ ...VALID, fiatTotal: Number.POSITIVE_INFINITY }),
    'Enter a smaller amount',
  )
  assert.equal(
    getOfferMissingRequirement({ ...VALID, fiatTotal: EXCHANGE_MAX_FIAT_AMOUNT + 1 }),
    'Enter a smaller amount',
  )
  assert.equal(getOfferMissingRequirement({ ...VALID, hasPayoutAccount: false }), 'Choose a payout account')
})

test('accepts a complete offer', () => {
  assert.equal(getOfferMissingRequirement(VALID), null)
})
