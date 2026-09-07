import { Link } from 'react-router-dom'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { APP_INFO } from '@/content'
import { FOOTER_COLUMNS, FOOTER_LEGAL, FOOTER_SOCIAL, type SitemapLink } from './content'
import { FooterStatus } from './FooterStatus'

/**
 * Footer — the colophon, on the alternate paper ground:
 *   1. Wordmark + about + where to reach us, then the three link columns
 *      (Product · Build · Company)
 *   2. The legal row: the release line and disclaimer, with the live status
 *      chip from /v1/health on the right.
 */
export function Footer() {
  return (
    /*
      `-mt-px`: the footer's top rule sits ON the bottom rule of whatever
      precedes it rather than under it. The last section of the spine is an
      alternate surface, which draws its own bottom hairline; without the
      overlap the seam was two hairlines of different weight, the only such
      seam on the page. Overlapping keeps one rule here whatever comes above
      — a ruled section on the landing, or plain prose on the legal pages.
    */
    <footer className="-mt-px border-t border-[var(--border-default)] bg-[var(--surface-background-alt)] pb-[clamp(30px,3.4vw,44px)] pt-[clamp(46px,5.4vw,72px)] text-[var(--content-primary)]">
      <div className="container-page">
        <div className="grid gap-[clamp(24px,3.6vw,48px)] sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,0.85fr))]">
          <div className="sm:col-span-2 lg:col-span-1">
            <BrandLogo height={22} />
            <p className="mt-5 max-w-[48ch] text-[13.5px] leading-[22px] text-[var(--content-tertiary)]">
              {APP_INFO.about}
            </p>
            <ul aria-label={FOOTER_SOCIAL_LABEL} className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              {FOOTER_SOCIAL.map((link) => (
                <li key={link.label}>
                  <FooterLink link={link} />
                </li>
              ))}
            </ul>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h5 className="eyebrow mb-3.5 text-[var(--content-tertiary)]">{column.title}</h5>
              <ul className="flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterLink link={link} />
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-[clamp(36px,4.4vw,58px)] flex flex-wrap items-center gap-[18px] border-t border-[var(--border-default)] pt-[22px]">
          <div className="flex max-w-[82ch] flex-col gap-1.5">
            <p className="font-[var(--font-mono)] text-[11px] leading-[18px] text-[var(--content-tertiary)]">
              {FOOTER_LEGAL.release}
            </p>
            <p className="caption leading-[1.55] text-[var(--content-tertiary)]">{FOOTER_LEGAL.disclaimer}</p>
          </div>
          <span className="md:ml-auto">
            <FooterStatus />
          </span>
        </div>
      </div>
    </footer>
  )
}

/** The accessible name of the brand block's link row. */
const FOOTER_SOCIAL_LABEL = 'Reach us'

function FooterLink({ link }: { link: SitemapLink }) {
  const cls =
    'text-[13.5px] text-[var(--content-secondary)] transition-colors hover:text-[var(--content-primary)]'
  if (link.href.startsWith('/#') || link.external) {
    return (
      <a
        href={link.href}
        target={link.external ? '_blank' : undefined}
        rel={link.external ? 'noreferrer' : undefined}
        className={cls}
      >
        {link.label}
      </a>
    )
  }
  return (
    <Link to={link.href} className={cls}>
      {link.label}
    </Link>
  )
}
