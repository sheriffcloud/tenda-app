import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { APP_INFO, GRANTS_BAND } from '@/content'

/**
 * The grant-team call-out under the ecosystem panels — deliberately direct:
 * says who it's for, what the money funds, and where to start reading.
 */
export function GrantsBand() {
  return (
    <aside
      className="relative mt-6 overflow-hidden rounded-3xl border border-[var(--accent-border)] bg-[var(--surface-card)] p-8 md:p-10"
      style={{
        background:
          'linear-gradient(120deg, var(--surface-card), color-mix(in oklab, var(--accent) 7%, var(--surface-card)))',
      }}
    >
      <div className="flex flex-col gap-4 md:max-w-[68ch]">
        <Eyebrow tone="accent" dot>
          {GRANTS_BAND.eyebrow}
        </Eyebrow>
        <h3 className="h2 text-[var(--content-primary)]">{GRANTS_BAND.title}</h3>
        <p className="body-lg text-[var(--content-secondary)]">{GRANTS_BAND.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button href={APP_INFO[GRANTS_BAND.cta.hrefKey]} variant="primary" size="lg">
            {GRANTS_BAND.cta.label}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
