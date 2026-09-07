import { APP_INFO } from '@/content'

export interface SitemapLink {
  label: string
  href: string
  /** Open in new tab when true. */
  external?: boolean
}

export interface SitemapColumn {
  title: string
  links: readonly SitemapLink[]
}

/**
 * The footer's three link columns — Product, Build, Company — as the Paper
 * Landing lays them out. In-page anchors name section ids; the whole-page
 * rhythm test checks every one of them points at a section that renders.
 */
export const FOOTER_COLUMNS: readonly SitemapColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'The app',              href: '/#app'       },
      { label: 'Hire loop',            href: '/#hire-loop' },
      { label: 'Gigs & Exchange',      href: '/#products'  },
      { label: 'When things go wrong', href: '/#exits'     },
    ],
  },
  {
    title: 'Build',
    links: [
      { label: 'Multichain',      href: '/#ecosystems' },
      { label: 'Agent API',       href: '/#onboarding' },
      { label: 'Getting started', href: '/#onboarding' },
      { label: 'Contracts',       href: APP_INFO.chains.contractsUrl, external: true },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'FAQ',     href: '/#faq'    },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms',   href: '/terms'   },
    ],
  },
] as const

/**
 * Where to reach Tenda — under the wordmark and the about line, not in a
 * sitemap column: a Telegram group for help, X for announcements. These are
 * the brand's channels, so they sit with the brand; the columns stay a map of
 * the site. WhatsApp was a one-to-one line nobody could join.
 */
export const FOOTER_SOCIAL: readonly SitemapLink[] = [
  { label: 'Telegram', href: APP_INFO.telegramUrl, external: true },
  { label: 'X',        href: APP_INFO.twitterUrl,  external: true },
] as const
