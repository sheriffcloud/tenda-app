/**
 * The hand-written onboarding cards — the ones that are not a gas policy.
 * Each says why it is written by hand and what its status depends on. See
 * types.ts for the folder.
 */

import { AGENT_BADGE_LABEL } from '@tenda/shared/constants/users'
import { EVM_CHAIN_NAMES_PROSE, SOLANA_CHAIN_NAMES_PROSE } from '../chains'
import type { OnboardingFeature } from './types'

/**
 * The cross-chain card. Not a gas policy, so it is not derived from one — but
 * the chains it names still are: the wallet story splits on CAIP-2 namespace
 * (Solana goes through Mobile Wallet Adapter, every eip155 chain through
 * WalletConnect), so a new EVM L2 joins the second half of this sentence by
 * itself. This card was the one that still typed "On Solana … On EVM chains"
 * by hand while the other three derived their chain names.
 */
export const WALLET_FEATURE: Omit<OnboardingFeature, 'chains'> = {
  id: 'any-wallet',
  tab: 'Any wallet',
  /*
   * 'live', and NOT subject to statusFor — deliberately, because this card's
   * claim does not depend on escrow deployment at all.
   *
   * The gas cards do: a gas grant needs Tenda's per-chain seeding wallet, and
   * paying fees in USDC happens inside a Tenda transaction, so neither is
   * reachable until the contract is. Wallet CONNECTION is a property of the
   * app and the transport — Mobile Wallet Adapter on Android, WalletConnect on
   * any EVM chain. It works today and it goes on working unchanged at mainnet,
   * so gating it on chain status would mark a shipped capability as pending and
   * then "promote" it on launch day, having changed nothing.
   *
   * The rule this folder follows is not "everything defers to chain status" —
   * it is "a claim defers to whatever it actually depends on".
   */
  status: 'live',
  title: 'Bring the wallet you already have',
  body: `On ${SOLANA_CHAIN_NAMES_PROSE}, Android hands the connection to whichever wallet you use — Phantom, Solflare and the rest. On ${EVM_CHAIN_NAMES_PROSE}, any WalletConnect wallet works.`,
  fact: 'Mobile Wallet Adapter · WalletConnect',
}

/**
 * The 0G agent rail — Onboarding's 0G card. Not a gas policy (0G's manifest
 * policy is 'none', which deliberately contributes no card), so like
 * WALLET_FEATURE it is hand-written; unlike it, it NAMES A CHAIN, which is why
 * its status derives rather than being declared.
 *
 * IT SHIPPED. This card read `roadmap` with the copy "an agent WILL fund
 * escrow" and a fact line of "on the roadmap" — written while the x402
 * sign-only design was decided but unbuilt, and left behind when it was built.
 * The fund route, the agent API and a full agent-to-human hire settling in four
 * on-chain transactions all landed and were verified end to end on 0G Galileo.
 * A stale roadmap label understates shipped work exactly as a premature live
 * one overstates unshipped work; both are the same failure to keep a status
 * tied to something real.
 *
 * It reads Testnet rather than Live because the rail relays an on-chain
 * transaction into the escrow contract, so it genuinely depends on that contract
 * being deployed — and it names 0G MAINNET, which is launching, not live. It
 * becomes Live on its own the day #13 deploys, with no edit here. That chain
 * dependency is what separates it from WALLET_FEATURE, whose transports do not
 * touch the escrow at all.
 */
export const AGENT_FEATURE: Omit<OnboardingFeature, 'chains' | 'status'> = {
  id: 'agent-signature-funding',
  tab: 'Agent pay',
  title: 'AI agents pay with a signature',
  body: 'On 0G, an AI agent funds escrow by signing a payment authorization — Tenda relays it on-chain. No gas token to hold, no bridge, no custody.',
  fact: 'sign-only funding · x402 · verified end to end',
}

/**
 * The other side of the agent rail — Onboarding's second 0G card.
 *
 * AGENT_FEATURE is written for someone POINTING AN AGENT at Tenda. This one is
 * written for the person on the other end of that hire, who is the section's
 * primary reader and had nothing addressed to them: 0G declares
 * `gasPolicy: 'none'`, so it contributes no gas card, and the launch chain was
 * absent from the getting-started section entirely.
 *
 * Every clause is a shipped fact, not positioning. An agent posts and funds
 * through the same escrow primitive a person uses (#19 composes
 * draftResolution / attachGigDetails / relayDraftFunding); the badge is real and
 * on every surface that names a counterparty (PersonCard, GigCard, the gig
 * poster card, the profile page, with its own e2e spec); and the lifecycle that
 * follows is the ordinary one, settled end to end in #20.
 *
 * TYPOGRAPHIC quotes, not straight ones. React escapes `"` to `&quot;` in text,
 * so a body containing straight quotes does not survive into the markup as
 * written — and the onboarding render test compares the raw string against the
 * rendered HTML. It passed only while this card was not the default rail; the
 * moment it led the section the mismatch surfaced. Curly quotes pass through
 * untouched, and match the sibling notes.
 *
 * The badge text is READ FROM the shared constant rather than typed. If the app
 * ever relabels agents, copy promising a specific label would quietly become a
 * promise the product no longer keeps.
 */
export const AGENT_HIRE_FEATURE: Omit<OnboardingFeature, 'chains' | 'status'> = {
  id: 'agent-hires-you',
  tab: 'Agent hires',
  title: 'Your next client might be an AI',
  body: `On 0G, an AI agent posts a gig and funds escrow exactly as a person does — and it carries an “${AGENT_BADGE_LABEL}” badge everywhere it appears. You accept, do the work, submit proof, and the contract pays out.`,
  fact: 'same escrow as any gig · labelled, never hidden',
}

/**
 * The fiat on-ramp — Onramp.money and Yellow Card, on the roadmap (user,
 * 2026-09-02). Cross-chain like WALLET_FEATURE, hand-written like it, and
 * declared `roadmap` rather than derived: it depends on a provider
 * integration, not on any chain's deployment, so chain status has nothing to
 * say about it. It reads Roadmap until the integration ships, and the copy
 * promises no date.
 */
export const FIAT_ONRAMP_FEATURE: Omit<OnboardingFeature, 'chains'> = {
  id: 'fiat-onramp',
  tab: 'Fiat on-ramp',
  status: 'roadmap',
  title: 'Buy USDC with local money',
  body: 'Top up in your own currency and start with USDC already in your wallet. We are integrating Onramp.money and Yellow Card; until that ships, bring USDC from an exchange or trade for it on the Tenda exchange.',
  fact: 'Onramp.money · Yellow Card · on the roadmap',
}
