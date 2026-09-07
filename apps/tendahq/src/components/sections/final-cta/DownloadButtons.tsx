import { Download } from 'lucide-react'
import { DOWNLOAD_BUTTONS } from './content'
import { cn } from '@/lib/cn'

/**
 * Live APK download + two store buttons disabled with "Coming soon". Neither
 * listing exists yet — disabled pills (not real anchors) so screen readers
 * announce them as buttons-disabled rather than broken links.
 */
export function DownloadButtons() {
  return (
    <div className="flex flex-col gap-3">
      <a
        href={DOWNLOAD_BUTTONS.primary.href}
        className={cn(
          'inline-flex items-center justify-center gap-3 rounded-2xl border-2 border-[var(--brand)] bg-[var(--brand)] px-6 py-4',
          'text-[var(--brand-on)] font-semibold transition-transform hover:scale-[1.01] active:translate-y-px',
          'shadow-[0_10px_24px_color-mix(in_oklab,var(--brand)_22%,transparent)]',
        )}
      >
        <Download className="h-5 w-5" />
        <span className="flex flex-col items-start leading-tight">
          <span className="caption uppercase tracking-[0.16em] opacity-80">
            {DOWNLOAD_BUTTONS.primary.sub}
          </span>
          <span className="text-base">{DOWNLOAD_BUTTONS.primary.label}</span>
        </span>
      </a>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DOWNLOAD_BUTTONS.stores.map((store) => (
          <StoreButton key={store.name} name={store.name} top={store.top} />
        ))}
      </div>
    </div>
  )
}

function StoreButton({ name, top }: { name: string; top: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={`${name} — coming soon`}
      className={cn(
        'relative flex items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-3.5',
        'text-left text-[var(--content-secondary)] opacity-70',
        'cursor-not-allowed',
      )}
    >
      <StoreIcon name={name} />
      <span className="flex flex-col leading-tight">
        <span className="caption uppercase tracking-[0.16em] text-[var(--content-tertiary)]">
          {top}
        </span>
        <span className="text-base font-semibold text-[var(--content-secondary)]">
          {name}
        </span>
      </span>
      <span className="ml-auto inline-flex items-center rounded-full border border-[var(--border-default)] bg-[var(--surface-inset)] px-2 py-0.5 caption uppercase tracking-[0.12em] text-[var(--content-tertiary)]">
        Coming soon
      </span>
    </button>
  )
}

function StoreIcon({ name }: { name: string }) {
  if (name === 'Google Play') {
    return (
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden>
        <svg viewBox="0 0 32 32" className="h-7 w-7">
          <path d="M5.5 2.5C5.2 2.8 5 3.3 5 4v24c0 .7.2 1.2.5 1.5l16-13L5.5 2.5z" fill="#3ACB8E" />
          <path d="M21.5 16.5l-3.5 3-12.5 10.5c.5.4 1.2.4 2 .1l16-9c1-.6 1-1.6 0-2.1l-2-2.5z" fill="#FFC107" />
          <path d="M21.5 15.5l-16-13c-.8-.5-1.5-.5-2-.1l16 13.6 2-.5z" fill="#5E87E8" />
          <path d="M21.5 15.5l2 2.5 5-3c1-.6 1-1.6 0-2.1l-5-2.9-2 5.5z" fill="#FF5252" />
        </svg>
      </span>
    )
  }
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 32 32" className="h-7 w-7" fill="currentColor">
        <path d="M22.5 17c0-3 2.4-4.4 2.5-4.5-1.4-2-3.5-2.3-4.3-2.3-1.8-.2-3.5 1.1-4.5 1.1s-2.4-1.1-3.9-1c-2 0-3.9 1.2-4.9 3-2.1 3.7-.5 9 1.5 12 1 1.4 2.2 3 3.8 3 1.5-.1 2.1-1 3.9-1s2.3 1 3.9 1c1.6 0 2.7-1.4 3.7-2.8 1.2-1.6 1.6-3.2 1.7-3.3-.1 0-3.4-1.3-3.4-5.2zM19.5 8c.8-1 1.4-2.4 1.2-3.8-1.2 0-2.6.8-3.5 1.7-.7.9-1.4 2.3-1.2 3.7 1.4.1 2.7-.7 3.5-1.6z" />
      </svg>
    </span>
  )
}
