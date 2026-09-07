'use client'

/**
 * The workspace's detail pane (Tier 2 comp, line 487+). Scrolls internally —
 * the grid is height-locked, so every pane owns its own overflow rather than
 * the page scrolling as a whole.
 *
 * `selectionKey` drives focus: when the reader picks a different row the pane
 * takes focus, which is what makes the ≤900px single-pane collapse usable at
 * all (the list is gone; without this the reader's focus is left on a node
 * that is no longer displayed). It deliberately does NOT focus on first
 * mount — stealing focus on page load fights the reader instead of helping.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export interface DetailPaneProps {
  children: ReactNode
  /** Accessible name for the pane region. */
  label: string
  /**
   * Identifies the current selection. A change moves focus here; `null` means
   * nothing is selected and focus stays put.
   */
  selectionKey?: string | null
  /** Where the ≤900px back affordance goes — usually the bare list route. */
  backHref?: string
  backLabel?: string
}

export function DetailPane({
  children,
  label,
  selectionKey = null,
  backHref,
  backLabel = 'Back to list',
}: DetailPaneProps) {
  const paneRef = useRef<HTMLElement>(null)
  // Seeded with the FIRST selection, which is what makes the mount case
  // idempotent: React StrictMode double-invokes mount effects in development
  // (and the app router enables StrictMode by default), so a "have I mounted
  // yet" flag flips on the first invocation and lets the second one steal
  // focus. Comparing keys instead is stable however many times it runs.
  const previousKey = useRef<string | null>(selectionKey)

  useEffect(() => {
    const previous = previousKey.current
    previousKey.current = selectionKey
    // Nothing selected: leave focus where the reader put it. Same key: this
    // is a re-render of the row already shown, not a new selection.
    if (selectionKey === null || selectionKey === previous) return
    paneRef.current?.focus()
  }, [selectionKey])

  return (
    <section
      ref={paneRef}
      data-detail
      aria-label={label}
      // -1 so the pane is programmatically focusable without entering the tab
      // order; outline-none because the focus here is a scripted hand-off,
      // not the reader tabbing to a control.
      tabIndex={-1}
      className="flex min-h-0 min-w-0 flex-col overflow-y-auto bg-surface-background outline-none"
    >
      {backHref !== undefined && (
        <div className="sticky top-0 z-10 border-b border-border-subtle bg-surface-navbar px-4 py-2.5 backdrop-blur sm:px-6">
          <Link href={backHref} data-pane-back className="inline-flex items-center gap-1 type-body-small font-semibold text-content-secondary transition-colors hover:text-content-primary">
            <ChevronLeft size={16} aria-hidden />
            {backLabel}
          </Link>
          <span className="mx-2 text-content-tertiary" aria-hidden>/</span>
          <span className="type-body-small font-semibold text-content-primary">Details</span>
        </div>
      )}
      {children}
    </section>
  )
}
