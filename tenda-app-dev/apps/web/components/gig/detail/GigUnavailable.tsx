/**
 * The gig could not be READ — distinct from a gig that does not exist, which
 * is `notFound()` and a real 404.
 *
 * Rendered by the page rather than by an error boundary, for the reason the
 * feed's twin exists: `error.tsx` is a client component, so its fallback
 * arrives with the hydration script and a reader with no JavaScript saw a
 * blank page. Measured on both public routes; fixing only the feed would have
 * left the same hole one click away.
 *
 * Two ways forward, because either may be the one that works: retrying this
 * gig (a fresh GET is a real retry server-side), or going back to the feed,
 * which is a different read and may well succeed.
 */
import Link from 'next/link'
import { RotateCw } from 'lucide-react'
import { ALERT_ACTION_CLASS, AlertPanel } from '@/components/ui/AlertPanel'
import { GIG_DETAIL_COPY } from './copy'

export function GigUnavailable({ href }: { href: string }) {
  return (
    <div className="mx-auto w-full max-w-content px-6 pb-24 pt-10">
      <AlertPanel
        title={GIG_DETAIL_COPY.unavailableTitle}
        body={GIG_DETAIL_COPY.unavailableBody}
        action={
          <div className="flex flex-wrap items-center gap-4">
            <Link href={href} className={ALERT_ACTION_CLASS}>
              <RotateCw size={16} aria-hidden />
              {GIG_DETAIL_COPY.unavailableAction}
            </Link>
            <Link
              href="/"
              className="mt-5 text-sm font-semibold text-feedback-danger-text underline"
            >
              {GIG_DETAIL_COPY.unavailableBrowse}
            </Link>
          </div>
        }
      />
    </div>
  )
}
