/**
 * The escrow dossier — the detail pane's centre (Tier 2 comp, lines 497-713).
 *
 * Composition only: the money block, the state timeline and the party-scoped
 * half each own their own rules, and this file just orders them. The public
 * half renders for everyone; the private half renders itself away when the
 * server's scoping has withheld it.
 */
import type { ReactNode } from 'react'
import type { EscrowTimelineInput } from '@tenda/shared'
import { StateTimeline } from '@/components/escrow/timeline'
import { MoneyBlock, type DossierFact } from './MoneyBlock'
import { PartyScopedSection, type PartyScopedProps } from './PartyScopedSection'

export interface EscrowDossierProps extends PartyScopedProps {
  title: string
  /** Base units, chain-attested NET. */
  amountRaw: string
  asset: string
  escrow: EscrowTimelineInput
  facts?: readonly DossierFact[]
  /** Rendered above the money block — takedown notices, CTAs. */
  banner?: ReactNode
  /**
   * Rendered after the party-scoped half: what this escrow lets the viewer DO.
   * A slot rather than props because the actions are a whole machine (gated
   * transitions, tx monitors, dialogs) and the dossier's job is to order the
   * page, not to know what a transition is.
   */
  children?: ReactNode
  formatStamp?: (iso: string) => string
}

export function EscrowDossier({
  title,
  amountRaw,
  asset,
  escrow,
  facts,
  banner,
  children,
  // Undefined is fine: both halves default to the SAME shared formatter, so an
  // escrow cannot stamp its timeline one way and its proofs another.
  formatStamp,
  ...partyScoped
}: EscrowDossierProps) {
  return (
    <article className="mx-auto w-full max-w-[840px] px-4 pb-12 pt-8 sm:px-7">
      {banner}
      <header className="rounded-card border border-border-subtle bg-gradient-to-br from-brand-primary-surface to-surface-card p-5 shadow-sm">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-primary">Escrow workspace</p>
        <h1 className="font-display text-[28px] font-bold leading-9 tracking-[-0.6px] text-content-primary">{title}</h1>
      </header>

      <MoneyBlock amountRaw={amountRaw} asset={asset} facts={facts} />
      <StateTimeline escrow={escrow} formatStamp={formatStamp} />
      <PartyScopedSection {...partyScoped} formatStamp={formatStamp} />
      {children}
    </article>
  )
}
