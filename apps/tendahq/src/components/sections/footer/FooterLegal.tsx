import { Link } from 'react-router-dom'
import { FOOTER_LEGAL } from './content'

/**
 * Bottom legal row. Wireframe layout:
 *   left  — copyright + disclaimer prose (small, ink-3)
 *   right — Terms · Privacy inline list, hairline divided
 */
export function FooterLegal() {
  return (
    <div className="flex flex-col items-start gap-5 border-t border-[var(--border-subtle)] pt-6 md:flex-row md:items-start md:justify-between md:gap-8">
      <div className="flex max-w-[58ch] flex-col gap-1.5">
        <p className="mono-sm text-[var(--content-tertiary)]">{FOOTER_LEGAL.copyright}</p>
        <p className="caption leading-[1.55] text-[var(--content-tertiary)]">
          {FOOTER_LEGAL.disclaimer}
        </p>
      </div>

      <ul className="flex shrink-0 items-center divide-x divide-[var(--border-subtle)]">
        {FOOTER_LEGAL.links.map((l) => (
          <li key={l.href} className="px-4 first:pl-0 last:pr-0">
            <Link
              to={l.href}
              className="mono-sm text-[var(--content-tertiary)] transition-colors hover:text-[var(--content-primary)]"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
