import { useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import {
  type BankAccountSummary,
  type EscrowCreationAttempt,
  reuseOrCreateEscrowCreationAttempt,
  SECONDS_PER_HOUR,
} from '@tenda/shared'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth.store'
import { ApiClientError, randomUuid } from '@tenda/shared'
import { showToast } from '@/components/ui'
import {
  declaredSignerFor,
  resolveSignersForChain,
  settleSignerFor,
  signSendAndReport,
} from '@/wallet/dispatch'
import { InsufficientBalanceError } from '@tenda/shared'
import { ensureSufficientBalance } from '@/wallet/balances'
import {
  classifyTransactionGateError,
  TRANSACTION_GATE_MESSAGE,
  transactionGateRoute,
} from '@tenda/shared'
import type { ExchangeAssetOption } from '@/hooks/useExchangeAssetOptions'


export interface OfferSubmitArgs {
  option: ExchangeAssetOption
  amountRaw: string
  account: BankAccountSummary
  fiatTotal: number
  currency: string
  rate: number
  acceptHours: number
  paymentWindowSeconds: number
}

/**
 * Post a P2P sell offer (kind='exchange' escrow): create draft → attach offer
 * terms (a failure discards the draft) → wallet signs the on-chain create. The
 * accept + payment windows are caller-chosen; the payment window threads to
 * BOTH the escrow completion duration and the offer's payment window (one
 * semantic). Preserves the 9D first-tx gate and the signing-declined → draft
 * survives path.
 */
export function useOfferSell() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const submissionInFlight = useRef(false)
  const creationAttempt = useRef<EscrowCreationAttempt | null>(null)

  /** The wallets[] load, read off the store rather than subscribed to: this
   *  hook renders nothing, so a subscription would only add re-renders. */
  const refreshLinkedWallets = () => useAuthStore.getState().refreshMe()

  async function submit(a: OfferSubmitArgs): Promise<void> {
    if (submissionInFlight.current) return
    submissionInFlight.current = true
    setSubmitting(true)
    let escrow_id: string | null = null
    try {
      creationAttempt.current = reuseOrCreateEscrowCreationAttempt(
        creationAttempt.current,
        [a.option.chainId, a.option.assetId, a.amountRaw, a.acceptHours,
          a.paymentWindowSeconds, a.account.id, a.fiatTotal, a.currency, a.rate],
        randomUuid,
      )
      const { operationId } = creationAttempt.current

      // Before the draft exists: an underfunded seller gets a clear message
      // instead of a wallet prompt, a revert, and an orphan draft to clean up.
      await ensureSufficientBalance({
        chainId: a.option.chainId,
        assetId: a.option.assetId,
        amountRaw: a.amountRaw,
        owners: resolveSignersForChain(a.option.chainId),
      })

      // Declared signer (signer contract): what the create BAKES is the wallet
      // the seller will actually sign with, not the server's primary guess.
      // Settled first, or on EVM the slot is still empty after a restart.
      await settleSignerFor(a.option.chainId)
      const signer = declaredSignerFor(a.option.chainId)
      const created = await api.escrows.create({
        creation_operation_id: operationId,
        kind: 'exchange',
        chain_id: a.option.chainId,
        asset: a.option.assetId,
        amount_raw: a.amountRaw,
        // A DURATION: the server anchors it when it builds the create (#41).
        accept_window_seconds: a.acceptHours * SECONDS_PER_HOUR,
        completion_duration_seconds: a.paymentWindowSeconds,
        ...(signer !== undefined ? { signer_address: signer } : {}),
      })
      escrow_id = created.escrow_id
      creationAttempt.current = null

      try {
        await api.exchange.create({
          escrow_id: created.escrow_id,
          fiat_amount: a.fiatTotal,
          fiat_currency: a.currency,
          rate: a.rate,
          payment_window_seconds: a.paymentWindowSeconds,
          payout_account_id: a.account.id,
        })
      } catch (e) {
        // Validation failure: discard the orphan draft before surfacing.
        await api.escrows.delete({ id: created.escrow_id }).catch(() => {})
        escrow_id = null
        throw e
      }

      await signSendAndReport({
        unsigned: created.unsigned,
        action: 'create',
        chain_id: a.option.chainId,
        escrow_id: created.escrow_id,
      })

      showToast('success', 'Offer submitted! It hits the order book once the escrow confirms.')
      router.replace(`/exchange/${created.escrow_id}` as Parameters<typeof router.replace>[0])
    } catch (e) {
      // 9D first-transaction gate. Its two halves part company at #60: the
      // CONTACT gate still routes, the WALLET gate answers in place (below).
      const gate = classifyTransactionGateError(e)
      if (gate !== null) {
        showToast('error', TRANSACTION_GATE_MESSAGE[gate])
        if (gate === 'wallet_required') {
          // #60, the same rule #59 set for the gig composer: the offer STAYS.
          // Navigating away took the whole composition with it — asset, amount,
          // rate, payout account — on a refusal the reader can fix in another
          // tab and come back from. The precondition notice above the picker is
          // the way out, and refreshing wallets[] is what makes it appear: the
          // server has just contradicted this client, so the list it believed
          // is the stale thing.
          void refreshLinkedWallets()
        } else {
          router.push(transactionGateRoute(gate))
        }
      } else if (e instanceof InsufficientBalanceError) {
        // Carries the exact shortfall; the generic branch below would replace
        // it with "Failed to create the offer" and lose the one useful fact.
        showToast('error', e.message)
      } else if (escrow_id !== null) {
        // Terms saved but signing failed/declined, the draft survives.
        showToast('info', e instanceof Error ? e.message : 'Signing incomplete, draft saved')
        router.replace(`/exchange/${escrow_id}` as Parameters<typeof router.replace>[0])
      } else {
        showToast('error', e instanceof ApiClientError ? e.message : 'Failed to create the offer')
      }
    } finally {
      submissionInFlight.current = false
      setSubmitting(false)
    }
  }

  return { submitting, submit }
}
