'use client'

/**
 * Step 3 — place and the two clocks.
 *
 * The clocks are deliberately together and deliberately explained: the accept
 * deadline governs the ESCROW (nobody takes it, the funds come back — expiry
 * is the refund path, never a separate state), while the completion window
 * only starts when someone actually takes the gig.
 */
import { CountryCityPicker } from '@/components/form/CountryCityPicker'
import { RemoteToggle } from '@/components/form/RemoteToggle'
import { DurationPicker } from '@/components/form/DurationPicker'
import { AcceptDeadlinePicker } from '../AcceptDeadlinePicker'
import { CrossBorderBanner } from '../CrossBorderBanner'
import { FieldNote, SectionLabel } from './parts'
import type { GigFormController } from '@/hooks/gig/useGigForm'

export function WhereWhenStep({ form }: { form: GigFormController }) {
  return (
    <div className="mt-7 flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <SectionLabel>Where</SectionLabel>
        <RemoteToggle value={form.isRemote} onChange={form.setIsRemote} />
        {!form.isRemote && (
          <CountryCityPicker
            country={form.selectedCountry}
            city={form.selectedCity}
            onChange={(country, city) => {
              form.setSelectedCountry(country)
              form.setSelectedCity(city)
            }}
          />
        )}
        <CrossBorderBanner
          remote={form.isRemote}
          country={form.selectedCountry}
          homeCountry={form.homeCountry}
          assetSymbol={form.assetSymbol}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Accept by</SectionLabel>
        <AcceptDeadlinePicker
          value={form.acceptDeadlineHours}
          onChange={form.setAcceptDeadlineHours}
        />
        <FieldNote>Past this, escrow refunds you. Expiry is the refund path.</FieldNote>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Time to complete</SectionLabel>
        <DurationPicker value={form.completionDuration} onChange={form.setCompletionDuration} />
        <FieldNote>Starts when someone takes the gig, not now.</FieldNote>
      </div>
    </div>
  )
}
