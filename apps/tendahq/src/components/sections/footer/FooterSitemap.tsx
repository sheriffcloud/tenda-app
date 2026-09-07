import { ExternalLink } from 'lucide-react'
import { FOOTER_NAV_LINKS, type SitemapLink } from './content'

/**
 * Pre-launch nav — small enough to render as a single horizontal row of
 * inline anchors. Hairline-bordered above + below so it reads as a
 * navigational band rather than a column list. When more pages exist,
 * promote back to multi-column via `./content/sitemap-future.ts`.
 */
export function FooterSitemap() {
  return (
    <nav
      aria-label="Footer"
      className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[var(--border-subtle)] py-4"
    >
      {FOOTER_NAV_LINKS.map((link) => (
        <FooterLink key={link.label} link={link} />
      ))}
    </nav>
  )
}

function FooterLink({ link }: { link: SitemapLink }) {
  const isExternal = link.external ?? link.href.startsWith('http')
  return (
    <a
      href={link.href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noreferrer' : undefined}
      className="body-sm inline-flex items-center gap-1.5 text-[var(--content-secondary)] transition-colors hover:text-[var(--content-primary)]"
    >
      {link.label}
      {link.badge ? (
        <span className="caption rounded-full bg-[var(--surface-card)] px-2 py-0.5 uppercase tracking-[0.12em] text-[var(--content-tertiary)]">
          {link.badge}
        </span>
      ) : null}
      {isExternal && !link.badge ? <ExternalLink className="h-3 w-3 opacity-60" /> : null}
    </a>
  )
}
