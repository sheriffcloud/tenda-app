'use client'

/**
 * Drives the resolve-sign flow with busy state + user feedback. The pure
 * orchestration lives in lib/resolution-sign (runResolutionSign); this only
 * adds React state and toasts.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { runResolutionSign, UnsupportedChainError, type WalletSigner } from '@/lib/resolution-sign'

export function useResolutionSign(resolutionId: string, onSigned: () => void) {
  const [busy, setBusy] = useState(false)

  async function sign(signer: WalletSigner) {
    setBusy(true)
    try {
      await runResolutionSign(resolutionId, signer)
      toast.success('Signed and broadcast — confirming on-chain')
      onSigned()
    } catch (err) {
      if (err instanceof UnsupportedChainError) {
        toast.error(err.message)
      } else {
        toast.error(err instanceof Error ? err.message : 'Signing failed')
      }
    } finally {
      setBusy(false)
    }
  }

  return { sign, busy }
}
