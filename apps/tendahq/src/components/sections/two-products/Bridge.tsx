import { TWO_PRODUCTS_BRIDGE } from './content'

/**
 * Centered hairline-text-hairline divider that closes the §03 panel pair.
 * "Same wallet · Same escrow · One app".
 */
export function Bridge() {
  return (
    <div className="mt-12 flex items-center justify-center gap-4 text-[var(--content-tertiary)]">
      <span aria-hidden className="hidden h-px w-20 bg-[var(--border-default)] sm:block" />
      <p className="caption uppercase tracking-[0.16em] text-[var(--content-tertiary)]">
        {TWO_PRODUCTS_BRIDGE.prefix} · {TWO_PRODUCTS_BRIDGE.middle} ·{' '}
        <span className="font-semibold text-[var(--content-primary)]">
          {TWO_PRODUCTS_BRIDGE.emphasis}
        </span>
      </p>
      <span aria-hidden className="hidden h-px w-20 bg-[var(--border-default)] sm:block" />
    </div>
  )
}
