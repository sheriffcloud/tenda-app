import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetBalance } from '@tenda/shared'
import { readSpendableBalance } from '@tenda/shared'
import { resolveSignersForChain } from '@/wallet/dispatch'
import { selectChainById, useChainRegistryStore } from '@/stores/chain-registry.store'

/**
 * Web port of mobile's hooks/useSpendableBalance (mount ≈ focus — the web
 * page mounts fresh on navigation, so the focus refresh becomes a mount
 * effect; `refresh` stays for explicit re-reads).
 *
 * 'loading' covers both the in-flight read and a registry that hasn't landed
 * yet. At 'ready', `balance === null` means UNKNOWN — no linked wallet, the
 * chain isn't in the registry, or a read failed. It NEVER means zero.
 * Advisory UI must stay silent on unknown rather than tell the user they're
 * short.
 */
export type SpendableBalanceStatus = 'loading' | 'ready'

interface UseSpendableBalanceResult {
  /** The most of this asset ONE transaction could move, across linked wallets. */
  balance: AssetBalance | null
  status: SpendableBalanceStatus
  refresh: () => void
}

/**
 * Identifies which (chain, asset, owner-scope) an answer belongs to.
 * '*' = the whole linked set, '-' = an unresolved owner (no read fired).
 */
function keyOf(chainId: string, assetId: string, owner: string | null | undefined): string {
  return `${chainId}|${assetId}|${owner === undefined ? '*' : (owner ?? '-')}`
}

/**
 * Keyed on `chainId` + `assetId` (+ `owner` when scoped) — NEVER the amount.
 * Callers compare against an amount that changes as the user types (the gig
 * budget field); depending on that amount here would fire one RPC per
 * keystroke. The amount belongs in the comparison, never in the fetch.
 */
export function useSpendableBalance(
  chainId: string,
  assetId: string,
  /**
   * Scope the read to ONE wallet — the previewed signer — so the answer is
   * "what can THIS wallet fund", not "what could any linked wallet". `null`
   * means the signer is unresolved: answers unknown without an RPC. Omit for
   * the across-wallets maximum.
   */
  owner?: string | null,
): UseSpendableBalanceResult {
  const chains = useChainRegistryStore((s) => s.chains)
  // The answer is stored WITH the key it answers, so a key change invalidates
  // it by derivation rather than by clearing state. Re-reading the same key
  // keeps the previous answer on screen until the new one lands, while a
  // stale answer for another chain can never be displayed.
  const [answer, setAnswer] = useState<{ key: string; balance: AssetBalance | null } | null>(null)
  // Discards a read whose key the caller has already moved on from.
  const runIdRef = useRef(0)

  const chain = selectChainById(chains, chainId)

  const refresh = useCallback(() => {
    const runId = (runIdRef.current += 1)
    const key = keyOf(chainId, assetId, owner)
    const owners =
      owner === undefined ? resolveSignersForChain(chainId) : owner === null ? [] : [owner]

    if (chain === null || owners.length === 0) {
      // A null chain while the registry is still loading is not an answer —
      // leave state untouched so a late registry re-renders into a real read
      // instead of latching an "unknown" the user never escapes. The answer
      // lands on a microtask so mount-effect callers never set state
      // synchronously inside the effect (web's stricter lint).
      if (chains === null) return
      void Promise.resolve().then(() => {
        if (runId !== runIdRef.current) return
        setAnswer({ key, balance: null })
      })
      return
    }

    readSpendableBalance(owners, chain, assetId)
      .then((balance) => {
        if (runId !== runIdRef.current) return
        setAnswer({ key, balance })
      })
      .catch(() => {
        // Unknown, not zero.
        if (runId !== runIdRef.current) return
        setAnswer({ key, balance: null })
      })
  }, [chainId, assetId, owner, chain, chains])

  useEffect(() => {
    refresh()
  }, [refresh])

  const fresh = answer !== null && answer.key === keyOf(chainId, assetId, owner)
  return {
    balance: fresh ? answer.balance : null,
    status: fresh ? 'ready' : 'loading',
    refresh,
  }
}
