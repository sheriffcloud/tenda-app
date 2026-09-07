/**
 * Legal foot — copyright + disclaimer + Terms / Privacy.
 *
 * Wireframe disclaimer ("Tenda is a software interface; payments are routed
 * via licensed partners. Crypto products may not be available in all
 * regions.") is preserved here, lightly re-cast for the on-chain truth.
 * Product + legal review before public mainnet may want to refine.
 */

export const FOOTER_LEGAL = {
  copyright: `© ${new Date().getFullYear()} Tenda Labs.`,
  disclaimer:
    'Tenda is a software interface; settlement is executed on-chain by the Tenda escrow contracts on Solana, Base and Celo. Crypto products may not be available in all regions. Testnet release — not financial advice.',
  links: [
    { label: 'Terms',   href: '/terms'   },
    { label: 'Privacy', href: '/privacy' },
  ],
} as const
