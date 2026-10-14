import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface Props {
  id: string
  active: boolean
  /** The id of the panel this tab controls. */
  controls: string
  onClick: () => void
  children: ReactNode
}

/**
 * A tab in a rail over one panel (§05 onboarding, §06 ecosystems): a 40px
 * control at the button radius; ink when selected, a hairline otherwise. The
 * caller owns the tablist and the `aria-selected` state.
 */
export function Tab({ id, active, controls, onClick, children }: Props) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-[var(--radius-button)] border px-4 text-[13px] font-semibold leading-none transition-colors',
        active
          ? 'border-[var(--content-primary)] bg-[var(--content-primary)] text-[var(--surface-background)]'
          : 'border-[var(--border-default)] bg-transparent text-[var(--content-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--content-primary)]',
      )}
    >
      {children}
    </button>
  )
}
