import { SectionShell } from '@/components/ui/SectionShell'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { ECOSYSTEM_PANELS, ECOSYSTEMS_HEADER } from '@/content'
import { EcosystemPanel } from './EcosystemPanel'
import { GrantsBand } from './GrantsBand'

/**
 * §06 Ecosystems — one panel per supported chain (identity derived from the
 * shared chain manifest) + the grants call-out band.
 */
export function Ecosystems() {
  return (
    <SectionShell id="ecosystems" surface="alt" padY="lg">
      <div className="mb-12 flex max-w-[62ch] flex-col gap-4">
        <Eyebrow tone="brand" dot>
          {ECOSYSTEMS_HEADER.eyebrow}
        </Eyebrow>
        <h2 className="h1 text-[var(--content-primary)]">
          {ECOSYSTEMS_HEADER.h2.lead}{' '}
          <span className="text-[var(--brand)]">{ECOSYSTEMS_HEADER.h2.emphasis}</span>
        </h2>
        <p className="body-lg text-[var(--content-secondary)]">{ECOSYSTEMS_HEADER.sub}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {ECOSYSTEM_PANELS.map((panel) => (
          <EcosystemPanel key={panel.chainFamily} panel={panel} />
        ))}
      </div>

      <GrantsBand />
    </SectionShell>
  )
}
