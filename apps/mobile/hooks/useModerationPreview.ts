import { useEffect, useRef, useState } from 'react'
import { ASSET_META, type ModerationPreviewResponse } from '@tenda/shared'
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
  paymentRaw: number
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
    paymentRaw > 0

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!ready) {
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
          amount_raw: String(paymentRaw),
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
