/**
 * Payments & Escrow guide — public SSR. The fee calculator is the one
 * interactive island (client component below the static content).
 */
import type { Metadata } from 'next'
import { SUPPORT_ESCROW_FLOW, SUPPORT_ESCROW_INTRO } from '@tenda/shared'
import { InfoCard, SupportTopicPage, supportTopicMetadata } from '@/components/public/support'
import { EscrowFeeCalculator } from './FeeCalculator'

export const metadata: Metadata = supportTopicMetadata('escrow')

export default function EscrowGuidePage() {
  return (
    <SupportTopicPage slug="escrow">
      <div className="flex max-w-[72ch] flex-col gap-4">
      <InfoCard label={SUPPORT_ESCROW_INTRO.label} body={SUPPORT_ESCROW_INTRO.body} />
      <InfoCard label="How the money moves">
        <ol className="flex flex-col gap-3">
          {SUPPORT_ESCROW_FLOW.map((step) => (
            <li key={step.num} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary-surface font-numeric text-xs font-bold text-brand-primary">
                {step.num}
              </span>
              <div>
                <p className="text-sm font-semibold text-content-primary">{step.title}</p>
                <p className="text-sm text-content-secondary">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </InfoCard>
      <EscrowFeeCalculator />
    </div>
    </SupportTopicPage>
  )
}
