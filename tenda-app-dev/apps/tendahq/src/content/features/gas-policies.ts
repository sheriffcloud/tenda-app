/**
 * The per-gas-policy half of the onboarding rail: one copy template per
 * policy, the card each policy yields, and the gas-free-start sentence the
 * FAQ assembles from the same templates. See types.ts for the folder.
 */

import type { GasPolicy } from '@tenda/shared/chains'
import { prose } from '@/lib/prose'
import { ACTIVE_GAS_POLICIES, chainsByGasPolicy } from '../chains'
import {
  contextFor,
  statusFor,
  type OnboardingFeature,
  type PolicyContext,
  type PolicyTemplate,
} from './types'

/**
 * One template per gas policy. `none` is deliberately absent: a chain where
 * the user simply pays their own gas has no onboarding story to tell, so it
 * contributes no card rather than an apologetic one.
 *
 * `paymaster` is `roadmap`, NOT in-progress. The server's ERC-4337 build path
 * sets the UserOperation sender to the user's EOA, which is invalid 4337 (an
 * EntryPoint calls validateUserOp on the sender, and an EOA has no code), and
 * the mobile dispatcher throws UnsupportedUnsignedTxError for that path. No
 * approach has been chosen yet, so the copy names no mechanism and promises
 * no date — see docs/paymaster_setup_and_findings.md.
 */
const GAS_POLICY_TEMPLATES: Partial<Record<GasPolicy, PolicyTemplate>> = {
  feeCurrency: {
    id: 'gas-in-stablecoin',
    tab: 'USDC gas',
    rail: 'built',
    title: () => 'Your USDC pays its own gas',
    body: (c) =>
      `On ${c.names}, network fees come out of the same USDC you trade with. No hunting for a separate gas token before your first move.`,
    fact: (c) => `feeCurrency: USDC — no ${c.natives} required`,
  },
  /*
   * `unbuilt`, DELIBERATELY, even though the rail is fully wired on Solana.
   *
   * The card covers every chain whose gasPolicy is 'native-seed', and since 0G
   * joined that set the card spans both namespaces — but the seed only exists
   * for one. TWO places hardcode it: `buildGasSeedDeps` builds a Solana sender
   * or none at all, and `db/seed/rows.ts` resolves a funder wallet only when
   * `namespace === 'solana'`, so an EVM chain seeds NULL and dispatch skips it
   * in silence. A card claiming a grant on 0G would therefore be false, and a
   * first-time user would meet that falsehood on their very first transaction.
   *
   * One card carries one status, so the choice is which way to be wrong.
   * Understating a shipped Solana rail is visible to us and costs a user
   * nothing; overstating an absent EVM one costs them a failed transaction.
   * Decision taken 2026-08-31; flip to 'built' when #53 lands the EVM sender,
   * and the copy below comes back with it.
   */
  'native-seed': {
    id: 'gas-grant',
    tab: 'Gas grant',
    rail: 'unbuilt',
    title: (c) => `Start with zero ${c.natives}`,
    body: (c) =>
      `Linking your first ${c.names} wallet will seed it with enough ${c.natives} for a full escrow lifecycle — post, lock, settle. It runs on Solana today and is not yet available everywhere, so until it is you pay your own gas.`,
    fact: () => 'one-time gas grant · not available on every chain yet',
  },
  paymaster: {
    id: 'sponsored-gas',
    tab: 'Sponsored gas',
    rail: 'unbuilt',
    title: (c) => `Sponsored gas on ${c.names}`,
    body: (c) =>
      `Covering your first transactions on ${c.names} is on our roadmap. Until it ships you pay your own gas there — which on an L2 runs to a fraction of a cent.`,
    fact: () => 'on the roadmap · not available yet',
  },
}

/**
 * "new Solana wallets get seeded with a small SOL grant, and on Celo your USDC
 * pays its own fees" — the gas-free-start clauses, assembled from the same
 * policy templates the cards use so the FAQ cannot name a chain the manifest
 * has stopped shipping (or miss one it has started).
 *
 * Only rails that EXIST contribute. A roadmap rail has no business in a
 * sentence promising you can start without gas money; a 'testnet' rail does,
 * because it genuinely works on the networks this release talks to.
 */
const GAS_FREE_CLAUSES: Partial<Record<GasPolicy, (c: PolicyContext) => string>> = {
  'native-seed': (c) => `new ${c.names} wallets get seeded with a small ${c.natives} grant`,
  feeCurrency: (c) => `on ${c.names} your USDC pays its own fees`,
}

/**
 * Build the sentence for a given set of policies. Exported so the SKIP paths
 * can be exercised: a policy with no clause (`none`), and a policy whose rail
 * is only on the roadmap (`paymaster`). Both must drop out — a sentence that
 * promises you can start without gas money has no business naming a chain
 * where you cannot.
 *
 * The third skip, `chains.length === 0`, is deliberately UNCOVERED and stays
 * that way. It fires when a policy still has copy but has lost its last chain
 * — the state you pass through by REMOVING a manifest entry, not by adding
 * one. Reaching it from a test would mean stubbing CHAIN_MANIFEST, which tests
 * the stub; leaving the guard out would render "On , network fees come out
 * of…" the first time a chain is retired. So: a guard worth having, a branch
 * not worth faking. `featureFor` carries the same pair for the same reason.
 */
export function gasFreeSentence(policies: readonly GasPolicy[]): string {
  const clauses = policies.flatMap((policy) => {
    const clause = GAS_FREE_CLAUSES[policy]
    const chains = chainsByGasPolicy(policy)
    if (clause === undefined || chains.length === 0) return []
    const template = GAS_POLICY_TEMPLATES[policy]
    if (template === undefined || statusFor(template.rail, chains) === 'roadmap') return []
    return [clause(contextFor(chains))]
  })
  // EMPTY MEANS EMPTY, not ".". This used to append the full stop
  // unconditionally, so a run with no qualifying rail produced a lone "." —
  // which the FAQ rendered as "you don't even need gas money to start: ." The
  // whole promise now carries inside the string, so having nothing to say
  // removes the sentence instead of leaving its punctuation behind.
  if (clauses.length === 0) return ''
  return `You don't even need gas money to start: ${prose(clauses)}.`
}

/**
 * The gas-free promise as a WHOLE sentence, lead-in included, or '' when no
 * rail can back it. Callers render it as its own sentence — see the note above
 * on why the lead-in moved in here.
 */
export const GAS_FREE_START_SENTENCE = gasFreeSentence(ACTIVE_GAS_POLICIES)

/**
 * One card for one gas policy, or null when the policy has no copy (`none`,
 * deliberately) or no chain currently running it. Exported for the same reason
 * as gasFreeSentence: both null paths are unreachable through the live
 * manifest and both decide whether a card appears at all.
 */
export function featureFor(policy: GasPolicy): OnboardingFeature | null {
  const template = GAS_POLICY_TEMPLATES[policy]
  if (template === undefined) return null

  const chains = chainsByGasPolicy(policy)
  if (chains.length === 0) return null

  const context = contextFor(chains)

  return {
    id: template.id,
    tab: template.tab,
    chains,
    status: statusFor(template.rail, chains),
    title: template.title(context),
    body: template.body(context),
    fact: template.fact(context),
  }
}
