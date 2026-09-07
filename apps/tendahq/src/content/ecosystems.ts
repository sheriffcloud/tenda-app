/**
 * Ecosystems section — one panel per supported chain, written for two readers
 * at once: users deciding whether Tenda is real, and ecosystem/grant teams
 * deciding whether Tenda is worth backing. Every proof point is a shipped,
 * verifiable integration (or explicitly labelled in-progress) — no vapour.
 * Panel identity (name, glyph, colour) comes from content/chains.ts.
 */

export interface EcosystemPanel {
  /** Manifest family — joins to LANDING_CHAINS for name/glyph/colour. */
  chainFamily: 'solana' | 'base' | 'celo'
  /** Why Tenda builds here — one sentence. */
  why: string
  /** Shipped or in-progress integration proof points, most impressive first. */
  proofs: readonly { label: string; inProgress?: true }[]
}

export const ECOSYSTEM_PANELS: readonly EcosystemPanel[] = [
  {
    chainFamily: 'solana',
    why: 'Where Tenda started — settlement fast enough to feel like handing over cash.',
    proofs: [
      { label: 'Native escrow program, written in Anchor' },
      { label: 'SOL gas grants so first-time users start at zero' },
      { label: 'Reduced platform fee on Solana Mobile (Seeker) devices' },
      { label: 'Phantom, Solflare + wallet-adapter ecosystem support' },
    ],
  },
  {
    chainFamily: 'base',
    why: 'USDC-native rails and the shortest path from a Coinbase account to a Tenda gig.',
    proofs: [
      { label: 'TendaEscrow Solidity contracts deployed and battle-tested on testnet' },
      { label: 'Gasless USDC approvals via EIP-2612 permit' },
      { label: 'Sponsored transactions via Base Paymaster', inProgress: true },
    ],
  },
  {
    chainFamily: 'celo',
    why: 'A chain designed for exactly Tenda’s users — mobile-first, stablecoin-first, emerging markets first.',
    proofs: [
      { label: 'Gas paid in USDC via Celo’s feeCurrency — verified on-chain' },
      { label: 'Same escrow contracts, same USDC, zero extra tokens to hold' },
      { label: 'cUSD supported on the exchange' },
    ],
  },
] as const

export const ECOSYSTEMS_HEADER = {
  eyebrow: 'Multichain · one escrow, three ecosystems',
  h2: { lead: 'Built deep into every chain', emphasis: 'we ship on.' },
  sub: 'Tenda isn’t "deployed to" these chains — it uses what makes each one special: Solana’s speed, Base’s USDC rails, Celo’s stablecoin gas. Same product, same guarantees, everywhere.',
} as const

export const GRANTS_BAND = {
  eyebrow: 'Ecosystem teams',
  title: 'Building this with the ecosystems it lives on.',
  body: 'Tenda is applying to the Solana, Base and Celo ecosystem grant programs to fund audits, mainnet launch and emerging-market growth. If you work on ecosystem or grants at any of these chains — we’d love to show you around the codebase.',
  cta: { label: 'Talk to us on X', hrefKey: 'twitterUrl' as const },
} as const
