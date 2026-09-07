import { useEffect, useRef, useState } from 'react'
import { ASSET_META, hasGigBudget, type ModerationPreviewResponse } from '@tenda/shared'
import { api } from '@/api/client'

const DEBOUNCE_MS = 800
const MIN_TITLE_CHARS = 4

export interface ModerationPreviewInput {
  title: string
  description: string
  category: string | null
  country: string | null
  /** Asset registry id + budget in its raw units (CO5). */
  asset: string
  /** Base-unit string; '' until a budget is set. */
  paymentRaw: string
}

/**
 * Live moderation hints while the user types (verbatim port of mobile's
 * hooks/useModerationPreview): debounced 800ms, never blocking, the create
 * path re-runs the same pipeline server-side and stays authoritative. Null
 * until a verdict arrives; errors are silent (the hint simply doesn't show).
 */
export function useModerationPreview(input: ModerationPreviewInput): ModerationPreviewResponse | null {
  const [verdict, setVerdict] = useState<ModerationPreviewResponse | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeq = useRef(0)

  const { title, description, category, country, asset, paymentRaw } = input
  const ready =
    title.trim().length >= MIN_TITLE_CHARS &&
    category !== null &&
    country !== null &&
    hasGigBudget(paymentRaw)

  // Render-time reset (web's stricter effect lint disallows the setState-in-
  // effect form mobile uses): leaving the ready state clears the verdict
  // immediately, same observable behavior.
  const [lastReady, setLastReady] = useState(ready)
  if (lastReady !== ready) {
    setLastReady(ready)
    if (!ready && verdict !== null) setVerdict(null)
  }

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!ready) {
      // Invalidate whatever is already on its way. The reset above clears what
      // is ON SCREEN, but a request issued while the input was still ready is
      // unaffected by it: losing readiness supersedes nothing, so that answer
      // matched the sequence and set itself — bringing the hint back over a
      // budget that had just been cleared, and again after the reader typed a
      // new one, since it is `ready` at the moment the OLD answer lands (#67).
      //
      // Here rather than beside the reset: the reset happens during RENDER
      // (react-hooks/set-state-in-effect makes mobile's in-effect form an error
      // on this side), and a ref must not be mutated there — a render React
      // discards would invalidate a request whose input is still live.
      ++requestSeq.current
      return
    }
    timer.current = setTimeout(() => {
      const seq = ++requestSeq.current
      api.moderation
        .preview({
          title: title.trim(),
          description: description.trim(),
          category: category,
          country: country,
          asset,
          amount_raw: paymentRaw,
          asset_decimals: ASSET_META[asset]?.decimals ?? 9,
        })
        .then((v) => {
          // Drop stale responses, only the latest input's verdict counts.
          if (seq === requestSeq.current) setVerdict(v)
        })
        .catch(() => {
          if (seq === requestSeq.current) setVerdict(null)
        })
    }, DEBOUNCE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [ready, title, description, category, country, asset, paymentRaw])

  return verdict
}
