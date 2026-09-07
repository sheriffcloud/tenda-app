/**
 * The onboarding rail, assembled: the derived gas-policy cards, the two 0G
 * agent cards and the wallet card, in the order the section shows them, plus
 * the section's header. See types.ts for how the folder is laid out.
 */

import { ACTIVE_GAS_POLICIES, chainByFamily } from '../chains'
import { AGENT_FEATURE, AGENT_HIRE_FEATURE, FIAT_ONRAMP_FEATURE, WALLET_FEATURE } from './cards'
import { featureFor } from './gas-policies'
import { statusFor, type OnboardingFeature } from './types'

export {
  FEATURE_STATUS_DISPLAY,
  statusFor,
  type FeatureStatus,
  type OnboardingFeature,
} from './types'
export { GAS_FREE_START_SENTENCE, featureFor, gasFreeSentence } from './gas-policies'

/**
 * Rails that EXIST first, roadmap last — a reader scanning the grid should meet
 * what works before what doesn't. 'live' and 'testnet' group together for that
 * ordering because both describe something built; only 'roadmap' describes
 * something absent. Within each group, manifest order is preserved; the agent
 * card leads the roadmap group (0G-first positioning, 2026-08-27).
 */
export const ONBOARDING_FEATURES: readonly OnboardingFeature[] = (() => {
  const derived = ACTIVE_GAS_POLICIES.map(featureFor).filter(
    (f): f is OnboardingFeature => f !== null,
  )
  // Split on EXISTS, not on 'live'. Splitting on 'live' was right when there
  // were two statuses; with three it put every built-but-unreachable rail into
  // the roadmap group, so the section led with a roadmap card and interleaved
  // Testnet and Roadmap pills down the rail. A reader scanning it could no
  // longer tell built from unbuilt by position.
  const built = derived.filter((f) => f.status !== 'roadmap')
  const roadmap = derived.filter((f) => f.status === 'roadmap')
  // The `[]` arm is the removal path — it fires only if 0G leaves the
  // manifest, the same deliberately-unfaked class as featureFor's
  // zero-chains guard: reaching it from a test would mean stubbing
  // CHAIN_MANIFEST, which tests the stub. The card then ships chainless
  // (like WALLET_FEATURE) rather than crashing the section.
  const zeroG = chainByFamily('0g')
  const agentChains = zeroG === undefined ? [] : [zeroG]
  const agentCard = { ...AGENT_FEATURE, status: statusFor('built', agentChains) }
  return [
    // Beside the agent card: same chain, opposite audience. Its status derives
    // the same way, so both 0G cards move together when the chain deploys.
    { ...AGENT_HIRE_FEATURE, status: statusFor('built', agentChains), chains: agentChains },
    // Status derived from the chain it names, not declared: the rail is built
    // (#18/#19/#20), so what is left to decide is reachability, and that is
    // statusFor's job. A chainless 0G — the removal path below — leaves the
    // rail built with nothing to place it on, which reads Testnet.
    { ...agentCard, chains: agentChains },
    ...built,
    { ...WALLET_FEATURE, chains: [] },
    ...roadmap,
    // Last: a roadmap card that is about money in, not gas — see cards.ts.
    { ...FIAT_ONRAMP_FEATURE, chains: [] },
  ]
})()

export const ONBOARDING_HEADER = {
  eyebrow: 'Getting started',
  aside: 'Less gas, less friction',
  h2: ['The hardest part of crypto,', 'mostly removed'],
  sub: 'Most people quit at "first, buy a gas token." Tenda deletes that step on the chains that can support it, and keeps it down to loose change everywhere else. Each rail below says plainly what ships today and what does not.',
  /** The heading over the chain chips on the panel. */
  whereLabel: 'Where it runs',
  /** The tab rail's accessible name. */
  railLabel: 'Onboarding rails',
} as const
