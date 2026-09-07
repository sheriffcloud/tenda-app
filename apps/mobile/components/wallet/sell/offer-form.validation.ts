import {
  AMOUNT_RAW_PRECISION,
  EXCHANGE_MAX_FIAT_AMOUNT,
  EXCHANGE_MAX_RATE,
} from '@tenda/shared'

export interface OfferValidationValues {
  hasAsset: boolean
  amountRaw: string | null
  rate: number
  fiatTotal: number
  hasPayoutAccount: boolean
}

export function getOfferMissingRequirement(values: OfferValidationValues): string | null {
  if (!values.hasAsset) return 'Choose an asset'
  if (values.amountRaw === null || values.amountRaw === '0') return 'Enter an amount'
  if (values.amountRaw.length > AMOUNT_RAW_PRECISION) return 'Enter a smaller amount'
  if (!Number.isFinite(values.rate) || values.rate <= 0) return 'Set your rate'
  if (values.rate > EXCHANGE_MAX_RATE) return 'Enter a lower rate'
  if (
    !Number.isFinite(values.fiatTotal) ||
    values.fiatTotal <= 0 ||
    values.fiatTotal > EXCHANGE_MAX_FIAT_AMOUNT
  ) return 'Enter a smaller amount'
  if (!values.hasPayoutAccount) return 'Choose a payout account'
  return null
}
