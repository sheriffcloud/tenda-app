/**
 * Onboarding-rail feature cards — the "you don't need gas money to start"
 * story.
 *
 * KEYED BY GAS POLICY, NOT BY CHAIN. The cards were never really about Solana,
 * Base and Celo; they are about the three ways gas gets out of a new user's
 * way, and the manifest already names those: `native-seed`, `feeCurrency`,
 * `paymaster`. Deriving the cards from `gasPolicy` means adding a chain that
 * reuses an existing policy costs ZERO copy edits — the new chain's name simply
 * joins the card that already describes its rail. Only a genuinely new policy
 * needs new prose, and then it needs exactly one template.
 *
 * Status is honest: `live` ships today, `roadmap` does not exist yet and says
 * so. Nothing here may claim a rail the code cannot perform.
 *
 * THE FOLDER. This file holds the vocabulary and the two derivations every
 * card shares — its status and the chain context its copy is written from.
 * `gas-policies.ts` holds the per-policy templates and the gas-free sentence,
 * `cards.ts` the hand-written cards, and `index.ts` assembles the rail.
 * Import from `@/content/features`.
 */

import { prose } from '@/lib/prose'
import type { LandingChain } from '../chains'
import { chainStatus } from '../chain-status'

/**
 * What a card may claim.
 *
 * - 'live'    the rail is built AND runs on a chain a visitor can use today
 * - 'testnet' the rail is built and working, but only where Tenda is deployed —
 *             which today is testnet only
 * - 'roadmap' the rail does not exist yet
 *
 * 'testnet' exists because two independent facts were previously collapsed into
 * one hardcoded string. The USDC-gas and gas-grant cards were declared 'live'
 * beside chain names taken from LANDING_CHAINS (mainnet), so the section
 * announced, with a pulsing Live pill, two conveniences on chains that have no
 * contract. Calling them 'roadmap' would have been the opposite error: both
 * rails are built and verified on-chain. Only 'testnet' is true of both halves.
 */
export type FeatureStatus = 'live' | 'testnet' | 'roadmap'

/**
 * Whether the RAIL ITSELF exists, independent of where it is deployed.
 *
 * Kept separate from FeatureStatus because the two answer different questions
 * and one of them does not move with deployment at all: `paymaster` is unbuilt
 * because the ERC-4337 path sets the UserOperation sender to the user's EOA,
 * which is invalid 4337 — that stays true no matter which chains go live. A
 * single hardcoded status could not express "built but unreachable" and
 * "unbuilt" as different things, so it expressed neither.
 */
export type RailBuild = 'built' | 'unbuilt'

export interface OnboardingFeature {
  id: string
  /** Short selector label ("USDC gas") — the tab rail the section renders;
   *  titles are full sentences and would blow the rail's width. */
  tab: string
  /** Chains this rail covers. Empty for cross-chain cards. */
  chains: readonly LandingChain[]
  status: FeatureStatus
  title: string
  body: string
  /** Mono fact line under the body — a concrete, verifiable detail. */
  fact: string
}

/** What the renderer needs to fill one policy's template. */
export interface PolicyContext {
  /** "Celo", or "Base and Celo" once a policy covers more than one chain. */
  names: string
  /** "SOL", or "SOL and ETH" — the native gas tokens of those chains. */
  natives: string
}

export interface PolicyTemplate {
  id: string
  tab: string
  /** Whether the rail exists. The CARD's status is derived — see statusFor. */
  rail: RailBuild
  title: (c: PolicyContext) => string
  body: (c: PolicyContext) => string
  fact: (c: PolicyContext) => string
}

/**
 * How a card's status is presented.
 *
 * Keyed by FeatureStatus so a new value is a type error here rather than a card
 * that renders no pill. Tones are literal strings resolved by the renderer —
 * content stays free of component imports. The mirror of CHAIN_STATUS_DISPLAY
 * in chain-status.ts, and deliberately the same shape: the two sections make
 * the same kind of claim.
 */
export const FEATURE_STATUS_DISPLAY: Record<
  FeatureStatus,
  { label: string; tone: 'live' | 'brand' | 'neutral' }
> = {
  live: { label: 'Live', tone: 'live' },
  testnet: { label: 'Testnet', tone: 'brand' },
  roadmap: { label: 'Roadmap', tone: 'neutral' },
}

/**
 * A card's status: the rail being built AND being reachable on a chain the
 * visitor can use.
 *
 * Both halves are load-bearing and neither can stand in for the other. The
 * USDC-gas and gas-grant rails are built and verified on-chain, so 'roadmap'
 * would be false about them; they run only on Celo and Solana MAINNET, which
 * have no contract, so 'live' was false too. `paymaster` fails the first half
 * for a reason that has nothing to do with chains and must survive Base going
 * live, which is exactly why the rail flag is declared rather than derived.
 *
 * Exported for the reason gasFreeSentence and featureFor are: the 'live' arm
 * cannot be reached through the current manifest — no mainnet chain is
 * deployed — and it is the arm that fires the day one is. A branch that first
 * runs on launch day is the last one that should be left untested.
 */
export function statusFor(rail: RailBuild, chains: readonly LandingChain[]): FeatureStatus {
  if (rail === 'unbuilt') return 'roadmap'
  return chains.some((chain) => chainStatus(chain) === 'live') ? 'live' : 'testnet'
}

/**
 * The chain-derived strings a policy's copy needs. Shared by the cards and by
 * GAS_FREE_START_SENTENCE, which describe the same rails in different grammar
 * and must never disagree about which chains are on them.
 */
export function contextFor(chains: readonly LandingChain[]): PolicyContext {
  return {
    names: prose(chains.map((c) => c.name)),
    // A policy's chains can share a native token; dedupe so two Ethereum L2s
    // read as "ETH", never "ETH and ETH".
    natives: prose([...new Set(chains.map((c) => c.nativeSymbol))]),
  }
}
