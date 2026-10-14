import { QR_FALLBACK } from './content'
import { Pill } from '@/components/ui/Pill'

/**
 * QR + caption. The destination (`tendahq.com/get`) is the eventual route but
 * is **not yet implemented** — caption labels it explicitly so anyone scanning
 * understands they're previewing what's coming. The QR pattern itself is
 * a static SVG approximation (decorative).
 */
export function QrFallback() {
  return (
    <div className="hidden items-center gap-4 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)] p-4 lg:flex">
      <DecorativeQr />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="body-sm font-semibold text-[var(--content-primary)]">
          {QR_FALLBACK.title}
        </p>
        <p className="caption text-[var(--content-tertiary)]">
          {QR_FALLBACK.body}{' '}
          <code className="mono-sm text-[var(--content-secondary)]">{QR_FALLBACK.destination}</code>
        </p>
        <Pill tone="warning" dot className="mt-1.5 self-start">
          {QR_FALLBACK.pendingLabel}
        </Pill>
      </div>
    </div>
  )
}

function DecorativeQr() {
  // Static dot-pattern from the wireframe — not a real QR. Decorative only
  // since the destination doesn't resolve yet (see QR_FALLBACK.pendingLabel).
  return (
    <svg
      viewBox="0 0 100 100"
      className="h-[88px] w-[88px] shrink-0 rounded-[var(--radius-xs)] bg-[#F4F2ED] p-1"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Decorative QR pattern (preview)"
    >
      <g fill="#0A0C12">
        <rect x="0" y="0" width="28" height="28" />
        <rect x="6" y="6" width="16" height="16" fill="#F4F2ED" />
        <rect x="10" y="10" width="8" height="8" />
        <rect x="72" y="0" width="28" height="28" />
        <rect x="78" y="6" width="16" height="16" fill="#F4F2ED" />
        <rect x="82" y="10" width="8" height="8" />
        <rect x="0" y="72" width="28" height="28" />
        <rect x="6" y="78" width="16" height="16" fill="#F4F2ED" />
        <rect x="10" y="82" width="8" height="8" />
        <rect x="32" y="4" width="4" height="4" /><rect x="40" y="4" width="4" height="4" /><rect x="48" y="4" width="4" height="4" /><rect x="56" y="4" width="4" height="4" /><rect x="64" y="4" width="4" height="4" />
        <rect x="36" y="12" width="4" height="4" /><rect x="44" y="12" width="4" height="4" /><rect x="52" y="12" width="4" height="4" /><rect x="60" y="12" width="4" height="4" />
        <rect x="32" y="20" width="4" height="4" /><rect x="40" y="20" width="4" height="4" /><rect x="48" y="20" width="4" height="4" /><rect x="56" y="20" width="4" height="4" /><rect x="64" y="20" width="4" height="4" />
        <rect x="4" y="32" width="4" height="4" /><rect x="20" y="32" width="4" height="4" /><rect x="32" y="32" width="4" height="4" /><rect x="48" y="32" width="4" height="4" /><rect x="64" y="32" width="4" height="4" /><rect x="80" y="32" width="4" height="4" /><rect x="96" y="32" width="4" height="4" />
        <rect x="0" y="40" width="4" height="4" /><rect x="16" y="40" width="4" height="4" /><rect x="36" y="40" width="4" height="4" /><rect x="60" y="40" width="4" height="4" /><rect x="76" y="40" width="4" height="4" /><rect x="92" y="40" width="4" height="4" />
        <rect x="12" y="48" width="4" height="4" /><rect x="28" y="48" width="4" height="4" /><rect x="44" y="48" width="4" height="4" /><rect x="64" y="48" width="4" height="4" /><rect x="80" y="48" width="4" height="4" /><rect x="96" y="48" width="4" height="4" />
        <rect x="0" y="56" width="4" height="4" /><rect x="24" y="56" width="4" height="4" /><rect x="40" y="56" width="4" height="4" /><rect x="56" y="56" width="4" height="4" /><rect x="72" y="56" width="4" height="4" /><rect x="84" y="56" width="4" height="4" />
        <rect x="32" y="64" width="4" height="4" /><rect x="48" y="64" width="4" height="4" /><rect x="68" y="64" width="4" height="4" /><rect x="92" y="64" width="4" height="4" />
        <rect x="32" y="76" width="4" height="4" /><rect x="52" y="76" width="4" height="4" /><rect x="68" y="76" width="4" height="4" /><rect x="84" y="76" width="4" height="4" />
        <rect x="36" y="84" width="4" height="4" /><rect x="56" y="84" width="4" height="4" /><rect x="72" y="84" width="4" height="4" /><rect x="92" y="84" width="4" height="4" />
        <rect x="32" y="92" width="4" height="4" /><rect x="60" y="92" width="4" height="4" /><rect x="88" y="92" width="4" height="4" />
      </g>
    </svg>
  )
}
