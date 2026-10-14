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
      // Was '/#onboarding' — the SAME target as 'Getting started' below it, so
      // the column spent two rows on one destination. Now the reference itself.
      { label: 'Agent API',       href: APP_INFO.docsUrl, external: true },
      { label: 'Getting started', href: '/#onboarding' },
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
 * sitemap column: the WhatsApp community (a group anyone can join — it used to
 * be a one-to-one line, which is why it was left out), a Telegram group for
 * help, X for announcements. These are the brand's channels, so they sit with
 * the brand; the columns stay a map of the site. Every href is the shared
 * brand's, never typed here.
 */
export const FOOTER_SOCIAL: readonly SitemapLink[] = [
  { label: 'WhatsApp', href: APP_INFO.whatsappUrl, external: true },
  { label: 'Telegram', href: APP_INFO.telegramUrl, external: true },
  { label: 'X',        href: APP_INFO.twitterUrl,  external: true },
] as const
