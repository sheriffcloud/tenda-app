'use client'

/**
 * The offer's terms (Tier-3 comp, lines 596-606): a definition grid of the
 * facts the trade is made of.
 *
 * The comp lists "Available" and "Minimum" — an offer you can take a slice of.
 * Ours cannot be sliced: one escrow holds one amount and `accept` takes the
 * whole of it, so there is no minimum to state and "available" would imply a
 * partial fill the contract has no transition for (spec-correction #33). The
 * row says what is locked.
 *
 * "Payment rails" is the comp's last row and is absent for a different reason:
 * the seller's payout account is party-scoped, and the server nulls it for
 * everyone else. A public row naming their bank would publish the one field it
 * withholds (#36).
 */
import {
  ASSET_META,
  chainLabel,
  truncateWallet,
  BOUND_WALLET_LABEL,
  formatAssetAmount,
  formatDate,
  formatFiat,
  formatPaymentWindow,
  formatRate,
  type ExchangeDetail,
} from '@tenda/shared'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { useEscrowFee } from '@/hooks/escrow/useEscrowFee'
import { OFFER_DETAIL_COPY } from './copy'

export const OFFER_TERMS_COPY = {
  locked: 'Locked in escrow',
  total: 'Offer total',
  rate: 'Rate',
  network: 'Settles on',
  window: 'Payment window',
  closes: 'Offer closes',
  listed: 'Listed',
  yourWallet: BOUND_WALLET_LABEL,
  fee: (pct: string | null) => (pct === null ? 'Platform fee' : `Platform fee (${pct}%)`),
  unknown: '—',
} as const

interface TermRow {
  label: string
  value: string
  /** Figures are tabular; words are not. */
  mono?: boolean
}

export function OfferTerms({ offer }: { offer: ExchangeDetail }) {
  const currency = offer.fiat_currency
  const symbol = ASSET_META[offer.asset]?.symbol ?? offer.asset
  const { feeRaw, feePct } = useEscrowFee(offer.is_seeker, offer.amount_raw)

  const rows: TermRow[] = [
    { label: OFFER_TERMS_COPY.locked, value: formatAssetAmount(offer.amount_raw, offer.asset), mono: true },
    { label: OFFER_TERMS_COPY.total, value: formatFiat(Number(offer.fiat_amount), currency), mono: true },
    {
      label: OFFER_TERMS_COPY.rate,
      value: `${formatRate(Number(offer.rate), currency)} / ${symbol}`,
      mono: true,
    },
    { label: OFFER_TERMS_COPY.network, value: chainLabel(offer.chain_id) },
    {
      label: OFFER_TERMS_COPY.window,
      value: formatPaymentWindow(offer.payment_window_seconds),
      mono: true,
    },
    {
      label: OFFER_TERMS_COPY.fee(feePct),
      value:
        feeRaw === null
          ? OFFER_TERMS_COPY.unknown
          : `− ${formatAssetAmount(feeRaw.toString(), offer.asset)}`,
      mono: true,
    },
  ]
  // Viewer-relative on the wire: only the party this row belongs to ever
  // receives an address, so rendering it needs no viewer logic here.
  if (offer.my_signer_address !== null) {
    rows.push({
      label: OFFER_TERMS_COPY.yourWallet,
      value: truncateWallet(offer.my_signer_address),
      mono: true,
    })
  }
  if (offer.accept_deadline !== null) {
    rows.push({ label: OFFER_TERMS_COPY.closes, value: formatDate(offer.accept_deadline), mono: true })
  }
  rows.push({ label: OFFER_TERMS_COPY.listed, value: formatDate(offer.created_at), mono: true })

  return (
    <section className="mt-8 border-t border-border-subtle pt-6">
      <Eyebrow as="h2" className="mb-4.5">
        {OFFER_DETAIL_COPY.terms}
      </Eyebrow>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-8 gap-y-5">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="mb-1 type-body-small text-content-tertiary">{row.label}</dt>
            <dd
              className={
                row.mono
                  ? 'type-mono font-semibold text-content-primary'
                  : 'type-body font-semibold text-content-primary'
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
