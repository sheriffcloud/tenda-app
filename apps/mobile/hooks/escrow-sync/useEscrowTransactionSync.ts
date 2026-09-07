import { useEffect, useRef, useState } from 'react'
import { getEvmTransactionStatus, getTransactionStatus } from '@/wallet'
import { subscribeEscrowChannel } from '@/stores/realtime.store'
import {
  ESCROW_RPC_POLL_MS,
  ESCROW_SYNC_POLL_MS,
  ESCROW_SYNC_TIMEOUT_MS,
} from './constants'
import type { EscrowConfirmationResult } from './types'

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
    if (!signature) return
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

    const unsubscribe = escrowId
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
        const status = namespace === 'eip155' && chainId
          ? await getEvmTransactionStatus(txRef, chainId)
          : await getTransactionStatus(txRef)
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
