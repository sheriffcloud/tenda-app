/**
 * Ecosystems section — one panel per supported chain, written for two readers
 * at once: users deciding whether Tenda is real, and ecosystem teams deciding
 * whether Tenda is worth backing.
 *
 * EVERY proof point must be a shipped, verifiable integration, or carry
 * `roadmap` and say plainly that it is not here yet. No "in progress" for work
 * that has not started — the Base sponsorship rail was labelled in-progress
 * while its build path was known-invalid, which is the failure mode this rule
 * exists to prevent.
 *
 * Panel identity (name, glyph, colour) comes from content/chains.ts.
 */

import { CHAIN_STRENGTHS_PROSE, LANDING_CHAINS } from './chains'
import { MAINNET_STATUS_CLAUSE } from './chain-status'
import { FEE_PCT, SEEKER_FEE_PCT } from './fees'

export interface EcosystemPanel {
  /** Manifest family — joins to LANDING_CHAINS for name/glyph/colour. */
  chainFamily: '0g' | 'solana' | 'base' | 'celo'
  /** Why Tenda builds here — one sentence. */
  why: string
  /** Shipped integration proof points, most impressive first. */
  proofs: readonly { label: string; roadmap?: true }[]
}

// Panel order mirrors LANDING_CHAINS: 0G leads (launch positioning, 2026-08-27).
export const ECOSYSTEM_PANELS: readonly EcosystemPanel[] = [
  {
    chainFamily: '0g',
    why: 'The AI-native chain — Tenda is building the rails for AI agents to hire humans, and 0G is where they live.',
    proofs: [
      // No network qualifier on purpose (the Base panel's precedent): true of
      // the Galileo deployment today and stays true when the mainnet contract
      // lands — a "Galileo" here would go stale the hour that happens.
      { label: 'TendaEscrow deployed, with the full escrow lifecycle verified end to end' },
      { label: 'Bridged USDC (USDC.e over Chainlink CCIP) verified for settlement — permit support checked on-chain' },
      // NOT `roadmap`. This row was written while sign-only funding was designed
      // and unbuilt, and stayed dimmed after it shipped: #18 the x402 fund
      // route, #19 the agent API, #20 a full agent-to-human hire settling in
      // four on-chain transactions on Galileo. A proof point that understates
      // shipped work fails the panel's own rule as surely as one that overstates
      // unshipped work. No network qualifier, per the sibling row above.
      { label: 'Agent-to-human hiring API — an agent-funded hire settled end to end' },
    ],
  },
  {
    chainFamily: 'solana',
    why: 'Where Tenda started — settlement fast enough to feel like handing over cash.',
    proofs: [
      { label: 'Native escrow program, written in Anchor' },
      { label: 'SOL gas grants so first-time users start at zero' },
      {
        label: `Solana Mobile (Seeker) owners pay ${SEEKER_FEE_PCT}% instead of ${FEE_PCT}% — on every chain`,
      },
      { label: 'Connects through Mobile Wallet Adapter — Phantom, Solflare and the rest' },
    ],
  },
  {
    chainFamily: 'base',
    why: 'USDC-native rails and the shortest path from a Coinbase account to a Tenda gig.',
    proofs: [
      { label: 'TendaEscrow Solidity contracts, deployed with a full Foundry test suite' },
      { label: 'Gasless USDC approvals via EIP-2612 permit' },
      { label: 'Sponsored gas for first-time users', roadmap: true },
    ],
  },
  {
    chainFamily: 'celo',
    why: 'A chain designed for exactly Tenda’s users — mobile-first, stablecoin-first, emerging markets first.',
    proofs: [
      { label: 'Gas paid in USDC via Celo’s feeCurrency — verified on-chain' },
      { label: 'Same escrow contracts, same USDC, zero extra tokens to hold' },
      { label: 'cUSD tradable on the exchange alongside USDC and CELO' },
    ],
  },
] as const

/**
 * Field labels for the per-chain reference facts, and the copy control's two
 * states.
 *
 * THESE CAME FROM THE RETIRED NETWORKS SECTION. That section answered "what
 * exactly am I connecting to" — chain id, gas token, transport, explorer —
 * directly below this one, which answers "why does Tenda build here". Two
 * sections, the same four chains, and a reader had to hold one in their head
 * while scrolling the other. The facts now sit on the panel for the chain they
 * describe, which is also the only place they were ever needed.
 */
export const NETWORK_LABELS = {
  chainId: 'Chain id',
  gasToken: 'Gas token',
  transport: 'Wallet',
  explorer: 'Explorer',
} as const

/** Shown on the copy control before and after a successful copy. */
export const COPY_LABELS = { idle: 'Copy chain id', done: 'Copied' } as const

/** The pill a proof row carries when the work is not here yet. */
export const PROOF_LABELS = { roadmap: 'Roadmap' } as const

/**
 * "we build on", not "we ship on". The panels are honest per proof point —
 * each carries `roadmap` when it is not here yet — but the heading above them
 * once asserted shipping across all four chains, three of which had no
 * contract. The per-proof honesty was being undone by the sentence
 * introducing it.
 */
export const ECOSYSTEMS_HEADER = {
  // The count is derived: this line said "three ecosystems" beside a panel
  // list built from the manifest, so a fourth chain would have contradicted
  // the very grid underneath it.
  eyebrow: `Multichain · one escrow, ${LANDING_CHAINS.length} ecosystems`,
  aside: 'Chain ids are CAIP-2',
  /** The chain switcher's accessible name. */
  railLabel: 'Choose an ecosystem',
  h2: ['Built deep into every chain', 'we build on'],
  /*
   * MAINNET_STATUS_CLAUSE keeps its home HERE. It is the one sentence stating
   * in prose, rather than in a per-card badge, where mainnet settlement
   * actually stands — every word of it read from the manifest — and the
   * whole-page deployment-claim guard exists because this page once asserted
   * four deployments it did not have.
   */
  sub: `Tenda isn’t "deployed to" these chains — it uses what makes each one special: ${CHAIN_STRENGTHS_PROSE}. Pick one and the panel says both why we build there and exactly what you’d be connecting to — including whether the escrow contract is live there yet: ${MAINNET_STATUS_CLAUSE}.`,
} as const
