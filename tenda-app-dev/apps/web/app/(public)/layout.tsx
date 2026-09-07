import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/public/SiteHeader'
import { SiteFooter } from '@/components/public/SiteFooter'

/**
 * Tier-1 shell: header + footer, no app chrome (CLAUDE.md, shell table).
 *
 * `main` is a bare flex child and applies NO measure of its own. The comps'
 * Tier-1 pages are full-bleed sections (the feed's hero carries its own
 * background and rule edge-to-edge) that each centre their content at
 * `max-w-content`. A container here would box the hero in and force every
 * page that needs the full width to break back out of it.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
