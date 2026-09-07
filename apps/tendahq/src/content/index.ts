/**
 * Central content layer — every cross-section fact and showcased dataset on
 * the landing. Section-specific prose stays in each section's content.ts;
 * everything reusable or editorial (tasks, trades, features, chains) is here.
 */

export { APP_INFO, type AppInfo } from './app-info'
export {
  LANDING_CHAINS,
  CHAIN_NAMES_LINE,
  MORE_CHAINS_LABEL,
  chainByFamily,
  type LandingChain,
} from './chains'
export { EXAMPLE_TASKS, type ExampleTask } from './tasks'
export { EXAMPLE_TRADES, type ExampleTrade, type TradeAssetSymbol } from './trades'
export {
  ONBOARDING_FEATURES,
  ONBOARDING_HEADER,
  type OnboardingFeature,
  type FeatureStatus,
} from './features'
export { ECOSYSTEM_PANELS, ECOSYSTEMS_HEADER, GRANTS_BAND, type EcosystemPanel } from './ecosystems'
