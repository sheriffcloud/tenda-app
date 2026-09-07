import { SectionShell } from '@/components/ui/SectionShell'
import { FooterLegal } from './FooterLegal'
import { FooterSitemap } from './FooterSitemap'
import { FooterStatus } from './FooterStatus'
import { FooterWordmark } from './FooterWordmark'

/**
 * §11 Footer — system colophon. Pre-launch shape:
 *   1. Wordmark + about + version chip + social icons
 *   2. Horizontal nav (small set; promote back to columns once page count
 *      grows — see ./content/sitemap-future.ts)
 *   3. Operational status row (live from /v1/health)
 *   4. Bottom legal: copyright + disclaimer + Terms / Privacy
 *
 * The wireframe's "Built in Lagos · 14 countries · settled on-chain since
 * day one." marketing line is intentionally dropped (per product feedback);
 * the about paragraph from APP_INFO carries the elevator pitch instead.
 */
export function Footer() {
  return (
    <SectionShell surface="alt" padY="md" maxWidth="page">
      <FooterWordmark />

      <div className="mt-10">
        <FooterSitemap />
      </div>

      <div className="mt-6">
        <FooterStatus />
      </div>

      <div className="mt-10">
        <FooterLegal />
      </div>
    </SectionShell>
  )
}
