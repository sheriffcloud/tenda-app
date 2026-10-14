'use client'

/**
 * The one overlay skeleton every dialog composes — web twin of mobile's
 * ui/overlay/ModalBackdrop. Owns the full-screen dim layer, the centered
 * card, the aria contract (`role` + `aria-modal` + label) and focus
 * management, so no dialog hand-rolls `fixed inset-0` again.
 *
 * Dismissal is ONE opt-in concept: pass `onBackdropClick` and both the dim
 * layer's click AND Escape dismiss (clicks on the CARD never bubble out).
 * Dialogs that must not be dismissed mid-flight (transaction progress, busy
 * confirms) simply omit it and lock every way out at once.
 *
 * Focus is trapped for as long as the card is mounted. `aria-modal="true"`
 * PROMISES the rest of the page is inert; without a trap, Tab walks straight
 * out into content a screen reader has just been told is unavailable.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Everything focusable a dialog card realistically contains. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function ModalBackdrop({
  role = 'dialog',
  label,
  onBackdropClick,
  strongDim = false,
  cardClassName,
  /**
   * Which control takes focus on open. 'first' is right for a search field or
   * a safe primary action; 'last' puts it on the rightmost button. Omit to
   * focus the card itself — the safe default when any control would be a
   * loaded gun (a destructive confirm).
   */
  initialFocus = 'card',
  children,
}: {
  role?: 'dialog' | 'alertdialog'
  /** Accessible name for the dialog card. */
  label: string
  /** Clicking the dim layer. Omit to make the backdrop inert. */
  onBackdropClick?: () => void
  /** A heavier scrim for progress/blocking dialogs. */
  strongDim?: boolean
  /** Card extras: width cap, gap, text alignment, scroll behaviour. */
  cardClassName?: string
  initialFocus?: 'first' | 'last' | 'card'
  children: ReactNode
}) {
  const cardRef = useRef<HTMLDivElement>(null)

  // Restore focus to whatever opened the dialog, so dismissing does not dump
  // the reader back at the top of the document.
  useEffect(() => {
    const opener = document.activeElement
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  useEffect(() => {
    const card = cardRef.current
    if (card === null) return
    const focusable = () => [...card.querySelectorAll<HTMLElement>(FOCUSABLE)]

    // An explicit anchor beats positional selection: first/last break the
    // moment a dialog gains extra controls (a Switch-wallet row made 'first'
    // land on the wrong button of a destructive gate).
    const anchor = card.querySelector<HTMLElement>('[data-initial-focus]')
    if (anchor !== null) {
      anchor.focus()
    } else if (initialFocus === 'card') {
      card.focus()
    } else {
      const targets = focusable()
      const target = initialFocus === 'last' ? targets[targets.length - 1] : targets[0]
      // No controls yet (async content): the card still takes focus, so the
      // reader is never left outside the modal.
      ;(target ?? card).focus()
    }
  }, [initialFocus])

  useEffect(() => {
    const card = cardRef.current
    if (card === null) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && onBackdropClick !== undefined) {
        onBackdropClick()
        return
      }
      if (event.key !== 'Tab' || card === null) return
      const targets = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (targets.length === 0) {
        // Nothing to cycle through — keep focus on the card rather than
        // letting Tab escape a dialog that claims to be modal.
        event.preventDefault()
        card.focus()
        return
      }
      const first = targets[0]
      const last = targets[targets.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === card)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onBackdropClick])

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        strongDim ? 'bg-utility-scrim' : 'bg-utility-scrim/80',
      )}
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        ref={cardRef}
        role={role}
        aria-modal="true"
        aria-label={label}
        // -1 so the card is programmatically focusable without joining the
        // tab order; it is the trap's anchor and the safe default target.
        tabIndex={-1}
        className={cn(
          'animate-popin flex w-full flex-col rounded-sheet border border-border-strong bg-surface-card-elevated p-6 shadow-elevated outline-none',
          cardClassName ?? 'max-w-[440px] gap-4',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
