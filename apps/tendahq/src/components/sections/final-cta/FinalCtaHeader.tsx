import { LiveDot } from '@/components/ui/LiveDot'
import { FINAL_CTA_HEADER } from './content'

export function FinalCtaHeader() {
  return (
    <div className="flex flex-col gap-6">
      <p className="eyebrow inline-flex items-center gap-2 text-[var(--content-tertiary)]">
        <LiveDot size={6} pulseMs={1600} />
        <span className="mono font-semibold text-[var(--content-secondary)]">{FINAL_CTA_HEADER.eyebrow.num}</span>
        <span className="opacity-60">·</span>
        <span>{FINAL_CTA_HEADER.eyebrow.label}</span>
      </p>

      <h2 className="h-hero text-[var(--content-primary)]">
        {FINAL_CTA_HEADER.h2.line1}
        <br />
        <span className="text-brand-gradient">{FINAL_CTA_HEADER.h2.accent}</span>{' '}
        <span className="text-[var(--content-tertiary)]">{FINAL_CTA_HEADER.h2.dim}</span>
      </h2>

      <p className="body-lg max-w-[58ch] text-[var(--content-secondary)]">
        {FINAL_CTA_HEADER.sub[0]}{' '}
        <span className="font-semibold text-[var(--content-primary)]">
          {FINAL_CTA_HEADER.sub[1]}
        </span>
      </p>
    </div>
  )
}
