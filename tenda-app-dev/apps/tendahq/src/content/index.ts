/**
 * Central content layer — every cross-section fact and showcased dataset on
 * the landing. Section-specific prose stays in each section's content.ts;
 * everything reusable or editorial (tasks, trades, features, chains) is here.
 */

export { APP_INFO, type AppInfo } from './app-info'
export {
  LANDING_CHAINS,
  CHAIN_NAMES_LINE,
  CHAIN_NAMES_PROSE,
  CHAIN_STRENGTHS_PROSE,
  EXCHANGE_ASSET_SYMBOLS_PROSE,
  EVM_CHAIN_NAMES_PROSE,
  chainByFamily,
  displayFor,
  explorerHost,
  transportFor,
  type LandingChain,
} from './chains'
export {
  chainStatus,
  LIVE_CHAINS,
  LAUNCHING_CHAINS,
  PLANNED_CHAINS,
  UNDEPLOYED_CHAINS,
  CHAIN_STATUS_DISPLAY,
  MAINNET_STATUS_CLAUSE,
  mainnetStatusClause,
} from './chain-status'
export {
  CURRENCIES,
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
} from './currencies'
export {
  CATEGORIES,
  CATEGORY_LABELS_PROSE,
  GIG_CATEGORIES,
} from './categories'
export {
  TRADE_CURRENCIES,
  TRADE_COUNTRIES_PROSE,
  TRADE_CURRENCIES_PROSE,
  TRADE_MARKET_COUNT,
  DISPLAY_CURRENCY_COUNT,
} from './markets'
export {
  FEE_PCT,
  SEEKER_FEE_PCT,
  APPROVAL_WINDOW_HOURS,
  FEE_EXAMPLE,
  GIG_ASSET_SYMBOL,
} from './fees'
export { EXAMPLE_ESCROW } from './escrow-example'
export { EXAMPLE_TASKS, type ExampleTask } from './tasks'
export { EXAMPLE_TRADES, type ExampleTrade, type TradeAssetSymbol } from './trades'
export {
  ONBOARDING_FEATURES,
  ONBOARDING_HEADER,
  FEATURE_STATUS_DISPLAY,
  statusFor,
  GAS_FREE_START_SENTENCE,
  type OnboardingFeature,
  type FeatureStatus,
} from './features'
export {
  COPY_LABELS,
  ECOSYSTEM_PANELS,
  ECOSYSTEMS_HEADER,
  NETWORK_LABELS,
  PROOF_LABELS,
  type EcosystemPanel,
} from './ecosystems'
