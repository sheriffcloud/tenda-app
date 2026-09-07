'use client'

/**
 * Copy-to-clipboard affordance (2026-08-24 redesign, spec-correction #48):
 * born for the exchange's payment instructions — an account number the buyer
 * retypes is an account number mistyped — and shaped as a primitive because
 * wallet addresses and tx hashes want the same affordance next.
 *
 * Feedback rides the toast layer rather than a local "Copied!" flip: the
 * button is 28px in a dense row, and swapping its icon under a moving cursor
 * is feedback half the readers never see.
 */
import { Copy } from 'lucide-react'
import { cn } from '@/lib/cn'
import { showToast } from './Toast'

export function CopyButton({
  value,
  label,
  className,
}: {
  /** The RAW text to copy — never the display-formatted rendering. */
  value: string
  /** What was copied, for the accessible name and the toast ("Account number"). */
  label: string
  className?: string
}) {
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      showToast('success', `${label} copied`)
    } catch {
      // Clipboard access can be denied (permissions policy, insecure context).
      showToast('error', 'Could not copy — select the text instead')
    }
  }

  return (
    <button
      type="button"
      aria-label={`Copy ${label.toLowerCase()}`}
      onClick={() => void copy()}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-content-tertiary transition-colors hover:bg-surface-inset hover:text-content-primary',
        className,
      )}
    >
      <Copy size={14} aria-hidden />
    </button>
  )
}
