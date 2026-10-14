import { APP_INFO } from '@/content'
import { ENV } from '@/env'

export interface NavLink {
  label: string
  href: string
}

/**
 * Section IDs match each <SectionShell id="…"> in components/sections. The
 * five links are the Paper Landing's: the app, the hire loop, the two
 * products, the chains, and the questions. Gigs + Exchange are both covered
 * by the single Two-Products section (#products).
 */
export const NAV_LINKS: readonly NavLink[] = [
  { label: 'The app',    href: '/#app'        },
  { label: 'Hire loop',  href: '/#hire-loop'  },
  { label: 'Products',   href: '/#products'   },
  { label: 'Multichain', href: '/#ecosystems' },
  { label: 'FAQ',        href: '/#faq'        },
] as const

/**
 * Hand-off to the web app (apps/web). NOT a member of NAV_LINKS: those are
 * same-page section anchors rendered as plain text links, this leaves the
 * landing site entirely and is rendered as the ONE filled button on the page.
 * The href is per-deployment (production vs Vercel preview), so it comes from
 * env rather than @/content — see ENV.webAppUrl.
 */
export const WEB_APP_LINK: NavLink = {
  label: 'Open the web app',
  href: ENV.webAppUrl,
}

/**
 * The Agent API reference (docs.tendahq.com). NOT a member of NAV_LINKS for
 * the same reason WEB_APP_LINK is not: those are same-page section anchors,
 * and `src/__tests__/page-rhythm.test.tsx` asserts every one of them resolves
 * to a section that actually renders — an outbound href there would fail it.
 *
 * Rendered as the SECOND outline control, beside the APK: the agent rail is
 * the product's differentiator and belongs in the bar rather than only the
 * footer, but "Open the web app" stays the page's ONE filled button.
 *
 * The href is a brand constant (shared APP_INFO), not env like `webAppUrl` —
 * the docs site is one deployment with no per-environment variance.
 */
export const DOCS_LINK: NavLink = {
  label: 'Agent API',
  href: APP_INFO.docsUrl,
}

export const NAV_LABELS = {
  brandAlt: 'Tenda',
  primaryNav: 'Primary',
  ctaDownload: 'Download APK',
  toggleMenu: 'Toggle menu',
  toggleTheme: 'Switch theme',
  mobileEyebrow: 'Navigate',
  // Names the two products and the chains, and deliberately does NOT restate
  // the pitch: "Escrow-secured …" here was a seventh phrasing competing with
  // the shared tagline. What the nav uniquely adds is the chain list.
  mobileTagline: `Gigs & P2P cash trades · ${APP_INFO.chains.networksLine}`,
} as const
