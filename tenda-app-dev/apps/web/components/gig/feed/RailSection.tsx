/**
 * One labelled block in the filter rail. Five of them in the comp, all the
 * same shape: an eyebrow label, then the control.
 *
 * Two kinds of block, and they need different wiring:
 *
 *   ONE CONTROL (search, sort) — `htmlFor` makes the eyebrow a real `<label>`.
 *   That is the strongest association there is, and nothing further is needed.
 *
 *   A GROUP OF LINKS (category, market, arrangement, chain) — a `<label>` is
 *   invalid here (it may only point at a form control), which is why this
 *   branch renders a plain heading. But leaving it at that associates the name
 *   with NOTHING: the rail then reaches assistive tech as one flat run of
 *   twenty-five links — "All categories, Delivery, … Anywhere, Nigeria, …,
 *   Any chain, Solana Devnet" — with no way to tell that Nigeria is a market
 *   and Digital is a category, and with three different links all named
 *   "All …" pointing at the root feed. Verified in a real browser's accessibility
 *   tree, where the group names appeared as bare paragraphs. So the wrapper
 *   carries `role="group"` named by the eyebrow it already renders, matching
 *   what SiteFooter does for its three link groups and what ChainFilterChips
 *   and ListColumn already do elsewhere in this app.
 *
 * The id is DERIVED from the label rather than taken from `useId`, because
 * FeedRail is a server component and hooks are unavailable there. Two blocks
 * with the same label in one rail would collide — that would already be a bug,
 * since they would also read identically.
 */
import type { ReactNode } from 'react'
import { Eyebrow } from '@/components/ui'

/** Stable, SSR-safe id for a rail label. Private: the id is plumbing, the
 *  accessible NAME is the contract, and the tests assert the name. */
function railLabelId(label: string): string {
  return `rail-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

export function RailSection({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  if (htmlFor !== undefined) {
    return (
      <div>
        <Eyebrow as="label" htmlFor={htmlFor} className="mb-2.5 block">
          {label}
        </Eyebrow>
        {children}
      </div>
    )
  }

  const labelId = railLabelId(label)
  return (
    <div role="group" aria-labelledby={labelId}>
      <Eyebrow id={labelId} className="mb-2.5">
        {label}
      </Eyebrow>
      {children}
    </div>
  )
}
