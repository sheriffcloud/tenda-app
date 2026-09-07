import Link from 'next/link'
import { APP_INFO } from '@tenda/shared'
import { BrandLogo } from '@/components/brand/BrandLogo'

/**
 * Tier-1 footer (comp lines 822-839): the product in a sentence, then the
 * support pages a browsing visitor is most likely to need before signing up.
 *
 * Brand strings and outbound links come from the shared APP_INFO. The global
 * marketplace sentence deliberately names no fixed country set. The comp's
 * "404 example" link is a prototype affordance and is not shipped.
 */
const HELP_LINKS = [
  { href: '/support/escrow', label: 'How escrow works' },
  { href: '/support/posting', label: 'Posting a gig' },
  { href: '/support/working', label: 'Working a gig' },
] as const

const REFERENCE_LINKS = [
  { href: '/support/faq', label: 'FAQ' },
  { href: '/support/glossary', label: 'Glossary' },
] as const

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border-subtle bg-surface-background-alt">
      <div className="mx-auto flex w-full max-w-content flex-wrap items-start gap-8 px-6 py-10">
        <div className="min-w-[220px] flex-1">
          <BrandLogo full />
          <p className="mt-2 max-w-[40ch] type-body-small text-content-tertiary">
            {/* The tagline ALONE. It used to be followed by a hand-written
                sentence, which made the pair a fourth pitch nobody owned and
                meant the tagline could not be changed without re-reading a
                sentence in a different file. */}
            {APP_INFO.tagline}
          </p>
        </div>
        <FooterNav label="Guides" links={HELP_LINKS} />
        <FooterNav label="Reference" links={REFERENCE_LINKS} />
        <nav aria-label="Legal" className="flex flex-col gap-2">
          <a href={APP_INFO.external.website} className={FOOTER_LINK_CLASS}>
            About
          </a>
          <a href={APP_INFO.legal.terms} className={FOOTER_LINK_CLASS}>
            Terms
          </a>
          <a href={APP_INFO.legal.privacy} className={FOOTER_LINK_CLASS}>
            Privacy
          </a>
        </nav>
      </div>
    </footer>
  )
}

const FOOTER_LINK_CLASS = 'type-body-small font-semibold text-content-secondary hover:text-content-primary'

function FooterNav({
  label,
  links,
}: {
  label: string
  links: readonly { href: string; label: string }[]
}) {
  return (
    <nav aria-label={label} className="flex flex-col gap-2">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={FOOTER_LINK_CLASS}>
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
