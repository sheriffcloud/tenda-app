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
 * Live moderation hints while the user types (stage-6 § Mobile): debounced
 * 800ms, never blocking, the create path re-runs the same pipeline
 * server-side and stays authoritative. Null until a verdict arrives;
 * errors are silent (the hint simply doesn't show).
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

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!ready) {
      // Bump the sequence as well as clearing: a request may already be in
      // flight for the input the reader has just abandoned, and losing
      // readiness supersedes nothing on its own — its answer would still match
      // the sequence and set itself, bringing the hint back over a gig that no
      // longer has a budget (or a title, or a category).
      ++requestSeq.current
      setVerdict(null)
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
