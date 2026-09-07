import { APP_INFO } from '@/content'

export interface NavLink {
  label: string
  href: string
}

export const NAV_LINKS: readonly NavLink[] = [
  // Section IDs match each <SectionShell id="…"> in components/sections.
  // Gigs + Exchange are both covered by the single Two-Products section
  // (#products), so we don't ship a separate top-nav link for each.
  { label: 'Products',     href: '/#products'     },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Onboarding',   href: '/#onboarding'   },
  { label: 'Ecosystems',   href: '/#ecosystems'   },
  { label: 'FAQ',          href: '/#faq'          },
] as const

export const NAV_LABELS = {
  brandAlt: 'Tenda',
  ctaDownload: 'Download App',
  toggleMenu: 'Toggle menu',
  toggleTheme: 'Toggle theme',
  mobileEyebrow: 'Navigate',
  mobileTagline: `Escrow-secured gigs & P2P on ${APP_INFO.chains.networksLine}`,
} as const
