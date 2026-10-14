import { NotFoundPanel } from '@/components/public/NotFoundPanel'

/**
 * Global 404 — and what a hidden (taken-down) gig resolves to for anonymous
 * readers. Next injects `<meta name="robots" content="noindex">` on every 404
 * response, which is the second half of the takedown contract.
 *
 * This file is OUTSIDE the `(public)` route group, so it renders without the
 * site header and footer. That is Next's own boundary rather than a choice —
 * a not-found at the root cannot know which group the missing URL belonged to.
 * The panel therefore carries its own ways out.
 */
export default function NotFound() {
  return (
    <NotFoundPanel
      code="404"
      heading="There is nothing at this address"
      body="The gig may have been completed, refunded or taken down. Open gigs are always in the feed."
    />
  )
}
