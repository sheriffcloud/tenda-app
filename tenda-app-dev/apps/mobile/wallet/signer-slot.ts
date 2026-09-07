/**
 * WHICH address this device would sign from on a namespace right now — the one
 * mapping shared by the signing path (`dispatch`) and the preview
 * (`useSigningWallet`). In its own module on purpose: `dispatch.ts` pulls the
 * whole signing stack (web3.js, the WC adapter) in at import time, and a
 * surface that only wants to PREVIEW the signer has no business loading any of
 * it.
 *
 * A second copy of this mapping is how a preview starts naming a different
 * wallet than the one that opens.
 */
import type { ChainNamespace } from '@tenda/shared'
import { connectionSignal } from '@/wallet/reown/connection-signal'

/** The auth store's persisted/session slot for a namespace. Private: callers
 *  want `signerSessionAddress`, which is the slot AND the live session. */
function sessionAddressOf(
  state: { evmAddress: string | null; walletAddress: string | null },
  ns: ChainNamespace,
): string | null {
  return ns === 'eip155' ? state.evmAddress : state.walletAddress
}

/**
 * AppKit's LIVE account, peeked without opening anything. `<ReownBridge>`
 * mirrors it into the signal on every render, so it is current even for a
 * session AppKit restored on its own.
 *
 * Solana has no synchronous peek — MWA owns its session in AsyncStorage — and
 * its store slot is persisted, so there the slot is already the live answer.
 */
function liveSessionAddress(ns: ChainNamespace): string | null {
  return ns === 'eip155' ? connectionSignal.getAccount()?.address ?? null : null
}

/**
 * The signer-resolution INPUT both the preview and the declaration use: the
 * live session when there is one, else the store slot.
 *
 * The live read matters because `evmAddress` is session-scoped and stays null
 * after a restart (see auth.types) — so a RESTORED WalletConnect session leaves
 * the slot empty while `ensureEvmSession` is about to publish that very
 * account. Reading the slot alone previewed the PRIMARY and then signed with
 * the restored wallet: the mismatch the signer row exists to prevent.
 *
 * Not reactive (AppKit owns the session, as on web) — it is re-read on each
 * render, and a switch we perform ourselves writes the slot, which re-renders.
 */
export function signerSessionAddress(
  state: { evmAddress: string | null; walletAddress: string | null },
  ns: ChainNamespace,
): string | null {
  return liveSessionAddress(ns) ?? sessionAddressOf(state, ns)
}
