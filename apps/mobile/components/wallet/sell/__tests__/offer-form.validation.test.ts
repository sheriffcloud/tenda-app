import { EXCHANGE_MAX_FIAT_AMOUNT, EXCHANGE_MAX_RATE } from '@tenda/shared'
import { getOfferMissingRequirement } from '../offer-form.validation'

const VALID = { hasAsset: true, amountRaw: '1000000', rate: 1500, fiatTotal: 1500, hasPayoutAccount: true }

it('reports missing offer requirements in interaction order', () => {
  expect(getOfferMissingRequirement({ ...VALID, hasAsset: false })).toBe('Choose an asset')
  expect(getOfferMissingRequirement({ ...VALID, amountRaw: null })).toBe('Enter an amount')
  expect(getOfferMissingRequirement({ ...VALID, amountRaw: '0' })).toBe('Enter an amount')
  expect(getOfferMissingRequirement({ ...VALID, amountRaw: '9'.repeat(79) })).toBe('Enter a smaller amount')
  expect(getOfferMissingRequirement({ ...VALID, rate: Number.NaN })).toBe('Set your rate')
  expect(getOfferMissingRequirement({ ...VALID, rate: 0 })).toBe('Set your rate')
  expect(getOfferMissingRequirement({ ...VALID, rate: EXCHANGE_MAX_RATE + 1 })).toBe('Enter a lower rate')
  expect(getOfferMissingRequirement({ ...VALID, fiatTotal: Number.POSITIVE_INFINITY })).toBe('Enter a smaller amount')
  expect(getOfferMissingRequirement({ ...VALID, fiatTotal: EXCHANGE_MAX_FIAT_AMOUNT + 1 })).toBe('Enter a smaller amount')
  expect(getOfferMissingRequirement({ ...VALID, hasPayoutAccount: false })).toBe('Choose a payout account')
})

it('accepts a complete offer', () => {
  expect(getOfferMissingRequirement(VALID)).toBeNull()
})
