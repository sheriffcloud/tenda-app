import { BrandLogo } from '@/components/ui/BrandLogo'
import { APP_INFO } from '@/content'
import { FooterSocial } from './FooterSocial'

/**
 * Footer brand block — wordmark + about paragraph + version chip + socials.
 * Replaces the wireframe's bare wordmark column. The 14-countries tagline
 * the wireframe shipped is intentionally not used; the about paragraph from
 * `APP_INFO.about` is the elevator pitch a footer-arriving reader needs.
 */
export function FooterWordmark() {
  return (
    <div className="flex flex-col gap-5">
      <BrandLogo height={28} />

      <p className="body-sm max-w-[44ch] text-[var(--content-secondary)]">
        {APP_INFO.about}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <span className="mono-sm inline-flex w-fit items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1 uppercase tracking-[0.16em] text-[var(--content-tertiary)]">
          {APP_INFO.version}
        </span>
        <FooterSocial />
      </div>
    </div>
  )
}
