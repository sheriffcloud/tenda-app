/**
 * Web port of apps/mobile/hooks/escrow-sync/useEscrowTransactionSync.ts —
 * verbatim state machine (chain receipt is progress; only a server
 * frame/read proves UI convergence). Transports differ: the Solana status
 * poll rides web's shared-transport wrapper and the EVM receipt poll the
 * shared fetch helper; the WS channel comes from the realtime store
 * (S5.1). The poll chain (RPC receipt → server projection read) is the
 * INDEPENDENT convergence path and completes with zero frames delivered;
 * a matching escrow frame merely short-circuits it. Like mobile.
 */
import { useEffect, useRef, useState } from 'react'
import { TRANSACTION_RESILIENCE, getEvmTransactionStatus } from '@tenda/shared'
import { getSolanaTransactionStatus } from '@/wallet/send'
import { subscribeEscrowChannel } from '@/stores/realtime.store'

export const ESCROW_RPC_POLL_MS = TRANSACTION_RESILIENCE.confirmationPollMs
export const ESCROW_SYNC_POLL_MS = TRANSACTION_RESILIENCE.projectionPollMs
export const ESCROW_SYNC_TIMEOUT_MS = TRANSACTION_RESILIENCE.confirmationTimeoutMs
export const ESCROW_CONFIRM_DISMISS_MS = TRANSACTION_RESILIENCE.confirmedDismissMs

export type EscrowConfirmationState = 'waiting' | 'syncing' | 'applied' | 'failed' | 'deferred'

export interface EscrowConfirmationResult {
  state: EscrowConfirmationState
  failure: string
}

interface Args {
  signature: string | null
  escrowId?: string
  chainId?: string
  checkApplied: () => Promise<boolean>
}

const INITIAL: EscrowConfirmationResult = { state: 'waiting', failure: '' }

/** Chain receipt is progress; only a server frame/read proves UI convergence. */
export function useEscrowTransactionSync({ signature, escrowId, chainId, checkApplied }: Args) {
  const [result, setResult] = useState<EscrowConfirmationResult>(INITIAL)
  const checkRef = useRef(checkApplied)
  checkRef.current = checkApplied

  useEffect(() => {
    setResult(INITIAL)
    if (signature === null || signature === '') return
    const txRef = signature
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const chainDeadline = Date.now() + ESCROW_SYNC_TIMEOUT_MS
    let serverDeadline: number | null = null

    const finish = (next: EscrowConfirmationResult) => {
      if (stopped) return
      stopped = true
      if (timer !== null) clearTimeout(timer)
      setResult(next)
    }

    const unsubscribe = escrowId !== undefined && escrowId !== ''
      ? subscribeEscrowChannel(escrowId, (frame) => {
          if (frame.tx_ref === txRef) finish({ state: 'applied', failure: '' })
        })
      : null

    const schedule = (fn: () => Promise<void>, delay: number) => {
      if (!stopped) timer = setTimeout(() => void fn(), delay)
    }

    async function awaitServer() {
      if (stopped) return
      serverDeadline ??= Date.now() + ESCROW_SYNC_TIMEOUT_MS
      if (Date.now() > serverDeadline) {
        finish({ state: 'deferred', failure: 'Transaction confirmed on-chain and is still syncing.' })
        return
      }
      try {
        if (await checkRef.current()) {
          finish({ state: 'applied', failure: '' })
          return
        }
      } catch {
        // A transient read failure must not turn a confirmed transaction into failure.
      }
      schedule(awaitServer, ESCROW_SYNC_POLL_MS)
    }

    async function awaitChain() {
      if (stopped) return
      if (Date.now() > chainDeadline) {
        finish({ state: 'deferred', failure: 'Transaction is pending and will continue syncing.' })
        return
      }
      try {
        const namespace = chainId?.split(':')[0] ?? 'solana'
        const status = namespace === 'eip155' && chainId !== undefined
          ? await getEvmTransactionStatus(txRef, chainId)
          : await getSolanaTransactionStatus(txRef)
        // The signature may have changed, the component may have unmounted,
        // or an exact server frame may already have applied the transition
        // while this RPC request was in flight. Never overwrite that result.
        if (stopped) return
        if (status === 'failed') {
          finish({ state: 'failed', failure: 'Transaction failed on chain.' })
          return
        }
        if (status === 'confirmed' || status === 'finalized') {
          setResult({ state: 'syncing', failure: '' })
          await awaitServer()
          return
        }
      } catch {
        // WebSocket or the next RPC attempt may still provide confirmation.
      }
      schedule(awaitChain, ESCROW_RPC_POLL_MS)
    }

    void awaitChain()
    return () => {
      stopped = true
      if (timer !== null) clearTimeout(timer)
      unsubscribe?.()
    }
  }, [signature, escrowId, chainId])

  return result
}
