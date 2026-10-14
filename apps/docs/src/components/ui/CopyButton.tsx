/**
 * Copy one string, and say whether it went.
 *
 * This page is read by someone assembling a request in another window, so the
 * things they came to paste — the endpoint's URL, a request body, a recorded
 * answer — are controls rather than selection exercises.
 *
 * Three states, because two would lie. A browser can refuse `clipboard-write`
 * outright: an insecure origin, a permissions policy, a user setting. A button
 * that flashed "Copied" over a rejected write is worse than no button, so a
 * refusal says so and keeps the hint that tells a reader what to do instead.
 *
 * And the write is raced against a DEADLINE, which is not defensive padding:
 * MEASURED in Chrome on this page, with `clipboard-write` granted, a secure
 * origin and `document.hasFocus()` true, `writeText` returned a promise that
 * had still not settled after three seconds. Neither branch ever ran, so the
 * control said nothing at all — the exact silence the three states exist to
 * rule out. A write that has not landed by the deadline is reported the same
 * way a refusal is, because from the reader's side it is one.
 *
 * Where the API is absent altogether the control does not render, so nothing
 * on the page is a dead affordance.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { DOCS_COPY } from '@/content'
import { canCopy } from '@/lib/clipboard'

/** How long a verdict stands before the control returns to its label. */
export const COPY_FEEDBACK_MS = 1600

/** How long a write may take before it is reported as one that did not happen. */
export const COPY_TIMEOUT_MS = 1200

type CopyState = 'idle' | 'copied' | 'refused'

const LABEL: Readonly<Record<CopyState, string>> = {
  idle: DOCS_COPY.copy,
  copied: DOCS_COPY.copied,
  refused: DOCS_COPY.copyRefused,
}

export function CopyButton({ value, title }: { value: string; title: string }) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)

  // A pending write outlives the row it sits in — the deadline above bounds how
  // long, but not whether. Both the verdict and its reset are dropped once this
  // component is gone rather than setting state on nothing.
  useEffect(() => () => {
    alive.current = false
    if (timer.current !== null) clearTimeout(timer.current)
  }, [])

  const settle = useCallback((next: CopyState) => {
    if (!alive.current) return
    setState(next)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setState('idle') }, COPY_FEEDBACK_MS)
  }, [])

  const copy = useCallback(() => {
    const written = navigator.clipboard.writeText(value).then(() => true, () => false)
    const deadline = new Promise<boolean>((resolve) => setTimeout(() => { resolve(false) }, COPY_TIMEOUT_MS))
    void Promise.race([written, deadline]).then((ok) => { settle(ok ? 'copied' : 'refused') })
  }, [value, settle])

  if (!canCopy()) return null

  return (
    <button
      type="button"
      onClick={copy}
      // The visible word is the STATE and is the same on every one of these;
      // the accessible name is what this particular control copies, so a page
      // of them does not read as "Copy, Copy, Copy" to a screen reader.
      aria-label={title}
      title={state === 'refused' ? DOCS_COPY.copyRefusedHint : title}
      className="shrink-0 rounded-[var(--radius-xs)] border px-2 py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.6px]"
      style={{
        borderColor: state === 'refused' ? 'var(--feedback-danger-border)' : 'var(--border-default)',
        color: state === 'refused' ? 'var(--feedback-danger-text)' : 'var(--content-secondary)',
        background: state === 'copied' ? 'var(--feedback-success-surface)' : 'transparent',
      }}
    >
      {LABEL[state]}
    </button>
  )
}
