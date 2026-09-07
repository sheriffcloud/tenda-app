import { Pill } from '@/components/ui/Pill'
import { FALLBACK, type FallbackRoute } from './content'
import { cn } from '@/lib/cn'

/**
 * Fallback subsection — 4 deterministic escrow-exit routes. Closes §04 with:
 * funds are never stuck, every path settles. The on-chain code clause that
 * used to sit beside the routes was dropped (recommendation 1) so §05's live
 * ticker — which carries the same "on-chain and visible" proof — earns its
 * complexity without §04 stealing it first.
 */
export function Fallback() {
  return (
    <div
      className={cn(
        'mt-16 overflow-hidden rounded-3xl border border-[var(--border-default)] bg-[var(--surface-card-elevated)] p-6 sm:p-8 lg:p-10',
      )}
    >
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-12">
        <div className="min-w-0">
          <span className="caption inline-flex items-center gap-2 uppercase tracking-[0.16em] text-[var(--accent)]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 0 0 3px color-mix(in oklab, var(--accent) 22%, transparent)',
              }}
            />
            {FALLBACK.tag}
          </span>
          <h3 className="h2 mt-3 text-[var(--content-primary)]">{FALLBACK.h3}</h3>
          <p className="body-lg mt-4 text-[var(--content-secondary)]">{FALLBACK.body}</p>
        </div>

        <ul className="flex flex-col gap-2.5">
          {FALLBACK.routes.map((route) => (
            <RouteRow key={route.letter} route={route} />
          ))}
        </ul>
      </div>
    </div>
  )
}

function RouteRow({ route }: { route: FallbackRoute }) {
  return (
    <li
      className={cn(
        'flex flex-wrap items-start gap-x-3.5 gap-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3.5',
        'sm:flex-nowrap',
        route.aspirational && 'opacity-90',
      )}
    >
      <span className="mono inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-default)] text-xs font-bold text-[var(--content-secondary)]">
        {route.letter}
      </span>

      <div className="min-w-0 flex-1">
        <p className="body-sm text-[var(--content-secondary)]">
          <span className="font-semibold text-[var(--content-primary)]">{route.prefix}</span>{' '}
          {route.body}
        </p>
      </div>

      {/* Meta cluster — full row beneath the body on mobile (so the body owns
          the full content width), inline on the right at sm+. */}
      <div className="flex w-full items-center justify-start gap-2 pl-11 sm:ml-auto sm:w-auto sm:justify-end sm:pl-0">
        {route.aspirational && (
          <Pill tone="warning" size="sm">
            Planned
          </Pill>
        )}
        <span className="mono-sm whitespace-nowrap text-[var(--content-tertiary)]">
          {route.time}
        </span>
      </div>
    </li>
  )
}

