export interface SitemapLink {
  label: string
  href: string
  /** Open in new tab when true. */
  external?: boolean
  /** Tiny inline marker, e.g. "↗", "Soon", "PDF". */
  badge?: string
}

/**
 * Active footer nav — single horizontal row pre-launch. Once page count
 * grows, group into columns by uncommenting entries in
 * `./sitemap-future.ts` and switching back to the column grid.
 *
 * Community channels render as icon-only social anchors via
 * <FooterSocial />, separate from this list.
 */
export const FOOTER_NAV_LINKS: readonly SitemapLink[] = [
  { label: 'Products',     href: '/#products'     },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Onboarding',   href: '/#onboarding'   },
  { label: 'Ecosystems',   href: '/#ecosystems'   },
  { label: 'FAQ',          href: '/#faq'          },
] as const
