/**
 * Legal foot — the release line and the disclaimer.
 *
 * Both variable facts are DERIVED, not typed: the deployment clause from
 * chain-status.ts (every word of it moves with the manifest's per-chain
 * `status`) and the release stage from the version suffix that
 * bump-version.mjs stamps. This line used to hardcode "Solana, Base and Celo"
 * and "Testnet release" independently of the two places that already knew
 * both, so adding a chain or cutting a mainnet release left the legal
 * disclaimer — of all things — the last stale text on the page.
 *
 * The contracts' licence is what `contracts/evm/src/TendaEscrow.sol` declares
 * in its SPDX header.
 *
 * Product + legal review before public mainnet may want to refine the wording;
 * the facts inside it now maintain themselves.
 */

import { APP_INFO, MAINNET_STATUS_CLAUSE } from '@/content'

export const FOOTER_LEGAL = {
  /** The Paper Landing's release line, with its two facts derived. */
  release: `${APP_INFO.version} · Escrow contracts are open source under Apache-2.0. Mainnet settlement is ${MAINNET_STATUS_CLAUSE}. Tenda never takes custody of funds or fiat.`,
  // The chain list is GONE from this sentence, replaced by the deployment
  // clause: a disclaimer is the last text on a page that may state something
  // the product cannot back.
  disclaimer:
    `Tenda is a software interface; settlement is executed on-chain by the Tenda escrow contracts (${APP_INFO.chains.stage} · ${MAINNET_STATUS_CLAUSE}). Cash trades settle directly between the two parties. Crypto products may not be available in all regions. Not financial advice.`,
  /** The status chip's three states, from /v1/health. */
  status: { ok: 'Systems normal', degraded: 'Degraded', down: 'Unavailable', checking: 'Checking…' },
} as const
