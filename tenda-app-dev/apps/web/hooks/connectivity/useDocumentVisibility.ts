/**
 * THE AppState shim (stage-5 doc §5.1): web's single substitute for
 * react-native's AppState 'active'/'background'. Every hook that reacted
 * to AppState on mobile points here as it is ported (stage-5 lists six) —
 * one implementation, not six copies of a visibilitychange listener.
 *
 * Semantics mirror AppState's: the callback fires on CHANGES only (never
 * on mount), and the returned boolean is live state. Visibility is read
 * through useSyncExternalStore so hydration stays consistent (the server
 * snapshot is `visible`) without effect-time setState.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'

/** SSR-safe point read; a render pass without a document counts as visible. */
export function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

function subscribeVisibility(onStoreChange: () => void): () => void {
  document.addEventListener('visibilitychange', onStoreChange)
  return () => document.removeEventListener('visibilitychange', onStoreChange)
}

export function useDocumentVisibility(onChange?: (visible: boolean) => void): boolean {
  const visible = useSyncExternalStore(subscribeVisibility, isDocumentVisible, isDocumentVisible)

  // Read the latest callback at event time without re-binding anything.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Report transitions only: prev===null marks the mount render, which per
  // AppState semantics must not fire the callback even if already hidden.
  const prevRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (prevRef.current !== null && prevRef.current !== visible) {
      onChangeRef.current?.(visible)
    }
    prevRef.current = visible
  }, [visible])

  return visible
}
