'use client'

/**
 * Fire-and-forget toast layer (mobile's showToast convention). A module-level
 * queue + one <ToastHost/> in the ROOT layout (it must cover the public
 * routes too — the gig-detail island toasts on /gig/[id]): `showToast` works
 * from any code (stores, hooks, flows) without a React context, and toasts
 * survive route changes — the funding flow toasts THEN navigates, which an
 * inline notice cannot outlive.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastEntry {
  id: number
  type: ToastType
  message: string
}

/**
 * Per-type visibility window — the 2026-08-24 redesign's fix for "it
 * disappears before I can read it". A failure earns the longest read: it is
 * the one message the reader may need to act on.
 */
const DISMISS_MS: Record<ToastType, number> = {
  success: 6_000,
  info: 6_000,
  error: 8_000,
}
const MAX_VISIBLE = 3

let nextId = 1
let toasts: ToastEntry[] = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function showToast(type: ToastType, message: string): void {
  toasts = [...toasts, { id: nextId++, type, message }].slice(-MAX_VISIBLE)
  emit()
}

function dismiss(id: number): void {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test seam. */
export function clearToastsForTests(): void {
  toasts = []
  emit()
}

/**
 * The comps draw ONE neutral inverse pill for every toast. Kept that surface,
 * but not the flattening: a success and a failure that look identical make
 * the reader parse the sentence to learn which happened. The type shows as a
 * coloured leading edge on the comps' inverse card — their look, without
 * discarding the signal.
 */
const TONE: Record<ToastType, string> = {
  success: 'border-l-4 border-l-feedback-success-base',
  error: 'border-l-4 border-l-feedback-danger-base',
  info: '',
}

function ToastItem({ toast }: { toast: ToastEntry }) {
  // Hover pauses the clock — a reader mid-sentence must not lose the message
  // under their cursor. Leaving restarts the FULL window rather than a
  // remembered remainder: predictable, and generous exactly when someone has
  // shown they are reading.
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const timer = setTimeout(() => dismiss(toast.id), DISMISS_MS[toast.type])
    return () => clearTimeout(timer)
  }, [toast.id, toast.type, paused])

  return (
    // A div, no longer a button: the explicit ✕ inside needs to be a real
    // button, and buttons cannot nest. Clicking anywhere still dismisses
    // (pointer path); the ✕ is the visible affordance and the KEYBOARD path.
    <div
      role="status"
      onClick={() => dismiss(toast.id)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        'animate-popin pointer-events-auto flex w-full max-w-sm cursor-pointer items-center gap-3 rounded-control bg-surface-inverse px-5 py-3 text-left text-sm font-semibold text-content-inverse shadow-elevated',
        TONE[toast.type],
      )}
    >
      <span className="min-w-0 flex-1">{toast.message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={(event) => {
          event.stopPropagation()
          dismiss(toast.id)
        }}
        className="shrink-0 rounded-control p-1 text-content-inverse/70 transition-colors hover:bg-content-inverse/10 hover:text-content-inverse"
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  )
}

const EMPTY: ToastEntry[] = []

/** Mount ONCE (root layout). Renders the live queue bottom-center. */
export function ToastHost() {
  // The server snapshot is a stable EMPTY list: SSR/hydration render null,
  // and the first client subscription swap brings in any live queue — no
  // mounted-flag effect needed.
  const entries = useSyncExternalStore(subscribe, () => toasts, () => EMPTY)
  if (entries.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4">
      {entries.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
