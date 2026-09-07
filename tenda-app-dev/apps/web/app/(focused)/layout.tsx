import type { ReactNode } from 'react'
import { BrandMark } from '@/components/public/BrandMark'
import { ThemeToggle } from '@/components/app/ThemeToggle'
import { OfflineNotice } from '@/components/app/status/OfflineNotice'

/**
 * Focused shell for guest flows; authenticated composers replace its chrome
 * with the workspace through the nested layout.
 *
 * Auth remains a single-task surface. Composer URLs reuse this route group but
 * the nested authenticated layout supplies the workspace rail, keeping creation
 * in context with the rest of the signed-in product.
 *
 * The header carries exactly two things, and the omissions are the point. The
 * comp's header also holds a "screens" list and a `?state=` switcher; those are
 * affordances for whoever is reviewing the mock, like the Tier-1 comp's "404
 * example" link that #12 declined. What stays is the wordmark — an anchor and a
 * way out of a flow you did not mean to start — and the theme toggle, which
 * belongs anywhere the reader might be for more than a moment.
 *
 * The wordmark points at /welcome, as the comp has it — built in #15. The
 * screen it lands on offers both ways in AND a link into the public feed, so
 * the escape from a flow you did not mean to start is still one hop from
 * anywhere in it.
 *
 * Route groups do not affect the explicit sign-in and composer URLs.
 */
export default function FocusedLayout({ children }: { children: ReactNode }) {
  return (
    <div data-focused-shell className="flex min-h-dvh flex-col bg-surface-background">
      <OfflineNotice />
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex w-full max-w-[1080px] items-center gap-3 px-5 py-3">
          <BrandMark href="/welcome" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Centred BOTH ways, as the comp has it — every auth step is one short
          card and top-aligning it on a tall screen leaves it stranded. */}
      <main className="flex flex-1 items-center justify-center px-5 py-14">{children}</main>
    </div>
  )
}
