'use client'

/**
 * The route-level error boundary (Auth comp, lines 638-654).
 *
 * A client boundary by definition — React only reaches it after a render
 * throws in the browser — so the JS-off rule CLAUDE.md records for
 * `loading.tsx` and `notFound()` does not apply: with no JavaScript there is
 * no client render to fail. What DOES apply is that it cannot catch a throw in
 * the root layout; that is `global-error.tsx`'s job, and it is deliberately
 * absent because it must ship its own <html>/<body> outside every provider,
 * which makes it a second, unstyled app rather than this screen.
 *
 * "Try this screen again" is `reset()` — re-rendering the segment — and NOT a
 * reload: a reload discards the client session state the reader is mid-way
 * through, and the failure is usually one bad render, not a bad document.
 */
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui'
import { StatusScreen } from '@/components/app/status/StatusScreen'
import { ERROR_COPY } from '@/components/app/status/copy'

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-16">
      <StatusScreen
        icon={AlertTriangle}
        tone="danger"
        title={ERROR_COPY.title}
        body={ERROR_COPY.body}
        meta={error.digest === undefined ? undefined : ERROR_COPY.trace(error.digest)}
        actions={
          <>
            <Button onClick={reset}>{ERROR_COPY.retry}</Button>
            <Link href="/welcome" className={buttonVariants({ variant: 'outline' })}>
              {ERROR_COPY.home}
            </Link>
          </>
        }
      />
    </div>
  )
}
