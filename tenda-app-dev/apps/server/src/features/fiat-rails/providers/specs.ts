/**
 * Wire specs for the licensed providers (stage-8). These constants are the
 * ONLY thing #61 onboarding needs to finalize, paths/capabilities come
 * from the partner docs once merchant accounts exist. The adapter code
 * (`licensed-http.ts`) is wire-shape-agnostic.
 */

import type { LicensedProviderSpec } from './licensed-http'

export const YELLOWCARD_SPEC: LicensedProviderSpec = {
  id: 'yellowcard',
  base_url: 'https://api.yellowcard.io',
  capabilities: {
    onramp: true,
    offramp: true,
    currencies: ['NGN'],
    assets: ['USDC_SOL', 'USDC_BASE'],
  },
  paths: {
    quote: '/v1/partners/quotes',
    initiate: '/v1/partners/payments',
    status: '/v1/partners/payments/{ref}',
  },
}

export const ONRAMPMONEY_SPEC: LicensedProviderSpec = {
  id: 'onrampmoney',
  base_url: 'https://api.onramp.money',
  capabilities: {
    onramp: true,
    offramp: false,
    currencies: ['NGN'],
    assets: ['USDC_SOL', 'USDC_BASE'],
  },
  paths: {
    quote: '/onramp/api/v2/quotes',
    initiate: '/onramp/api/v2/transactions',
    status: '/onramp/api/v2/transactions/{ref}',
  },
}
