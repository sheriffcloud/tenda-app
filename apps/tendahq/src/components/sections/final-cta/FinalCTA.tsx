import { SectionShell } from '@/components/ui/SectionShell'
import { DeviceMock } from './DeviceMock'
import { DownloadButtons } from './DownloadButtons'
import { FinalCtaHeader } from './FinalCtaHeader'
import { QrFallback } from './QrFallback'
import { ReceiptsStrip } from './ReceiptsStrip'

/**
 * §10 Final CTA — page closer. Two-column on desktop:
 * headline + dual download CTAs + QR fallback on the left, Android device
 * mock on the right. Receipts strip below spans full width.
 */
export function FinalCTA() {
  return (
    <SectionShell id="download" surface="alt" padY="lg">
      <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16">
        <div className="flex flex-col gap-8">
          <FinalCtaHeader />
          <DownloadButtons />
          <QrFallback />
        </div>

        <div className="flex items-center justify-center">
          <DeviceMock />
        </div>
      </div>

      <div className="mt-16">
        <ReceiptsStrip />
      </div>
    </SectionShell>
  )
}
