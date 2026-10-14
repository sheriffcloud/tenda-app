/**
 * The 404 (Tier 1 comp, lines 748-760). Centred, 640px, two ways out.
 *
 * Two callers, and the comp anticipates both: the generic "nothing at this
 * address", and the taken-down gig — which IS a 404, deliberately, because a
 * hidden listing must not be distinguishable from one that never existed.
 * That is why `code` and the copy are props rather than baked in.
 *
 * The comp also prints a `meta` line — `GET /nowhere → 404` — under the body.
 * That is a PROTOTYPE affordance: it exists so a reviewer can see the HTTP
 * semantics the mock cannot demonstrate. Shipping it would show a stranger the
 * status code of the page they are already looking at, in a typeface that says
 * "you have done something wrong". Not ported; spec-correction #20, the same
 * call the footer's "404 example" link got in #12.
 */
import Link from 'next/link'
import { Eyebrow } from '@/components/ui'
import { buttonVariants } from '@/components/ui'

export function NotFoundPanel({
  code,
  heading,
  body,
  action,
}: {
  /** The comp's mono eyebrow — "404", or "404 · noindex" for a takedown. */
  code: string
  heading: string
  body: string
  /** Replaces the default "browse gigs" primary where a caller has a better one. */
  action?: { href: string; label: string }
}) {
  const primary = action ?? { href: '/', label: 'Browse open gigs' }
  return (
    <div className="mx-auto w-full max-w-[640px] px-6 py-24 text-center sm:py-32">
      <Eyebrow strong as="p">
        {code}
      </Eyebrow>
      <h1 className="mt-5 text-balance break-words font-display text-[32px] font-bold leading-[38px] tracking-[-1.2px] text-content-primary sm:text-[44px] sm:leading-[50px]">
        {heading}
      </h1>
      <p className="mx-auto mt-4 max-w-[48ch] text-[17px] leading-7 text-content-secondary">
        {body}
      </p>
      {/* Wraps rather than overflowing: this is the one page a visitor reaches
          by accident, so it is also the one most likely to be a narrow window. */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={primary.href} className={buttonVariants({ variant: 'primary' })}>
          {primary.label}
        </Link>
        <Link href="/support" className={buttonVariants({ variant: 'outline' })}>
          Get support
        </Link>
      </div>
    </div>
  )
}
