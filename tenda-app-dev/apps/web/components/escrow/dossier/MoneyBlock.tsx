/**
 * The dossier's money block (Tier 2 comp, lines 500-517): one figure, one
 * projection.
 *
 * The figure is `amount_raw` rendered through shared `splitAssetAmount`,
 * which returns the value and the ticker already apart — the comp sets them
 * at different sizes, and re-splitting the joined string on a space made this
 * layout depend on punctuation inside a function it does not own.
 *
 * It deliberately does NOT run useEscrowFee. That hook is the single source
 * for PROJECTING a fee before signing; on an escrow that already exists,
 * `amount_raw` is the chain-attested NET and the fee has already come off.
 * Re-deriving it here would show a second, disagreeing number for the same
 * money — the exact drift settlement-amount honesty exists to prevent.
 */
import { splitAssetAmount } from '@tenda/shared'
import type { ReactNode } from 'react'
import { Eyebrow } from '@/components/ui'
import { DOSSIER_COPY } from './copy'

export interface DossierFact {
  label: string
  value: ReactNode
}

export function MoneyBlock({
  amountRaw,
  asset,
  facts = [],
}: {
  /** Base units, as a decimal string. Chain-attested NET. */
  amountRaw: string
  asset: string
  facts?: readonly DossierFact[]
}) {
  const { amount, symbol } = splitAssetAmount(amountRaw, asset)

  return (
    <div className="mt-7 rounded-card border border-border-default bg-surface-card p-6 shadow-card">
      <Eyebrow>{DOSSIER_COPY.amountLabel}</Eyebrow>
      <div className="mt-2 flex items-end gap-2">
        <span className="type-mono-large font-bold text-utility-money">
          {amount}
        </span>
        {/* See GigCard: the space is for textContent, not for layout. */}
        {' '}
        <span className="pb-1 type-mono text-content-tertiary">
          {symbol}
        </span>
      </div>
      <p className="mt-2 max-w-[52ch] type-body-small text-content-secondary">
        {DOSSIER_COPY.amountNote}
      </p>

      {facts.length > 0 && (
        <dl className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-6 gap-y-4 border-t border-border-subtle pt-5">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="mb-0.5 text-xs leading-4 text-content-tertiary">{fact.label}</dt>
              <dd className="type-body text-content-primary">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
