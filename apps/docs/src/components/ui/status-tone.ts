/**
 * Which tone a status wears, and which answers a caller plans for.
 *
 * 2xx reads as settled, 5xx as ours, and the rest as the caller's — except
 * 402, which is pulled out of the 4xx group deliberately: on this API it is
 * the normal FIRST answer to a task post, not a refusal.
 */
import type { Tone } from './Chip'

export function toneForStatus(status: string): Tone {
  const first = status.charAt(0)
  if (first === '2') return 'ok'
  if (first === '4') return status === '402' ? 'brand' : 'warn'
  if (first === '5') return 'danger'
  return 'muted'
}

/**
 * Whether this status is part of the flow a caller writes code for, rather
 * than one they handle if it happens.
 *
 * Derived from the tone rather than re-tested, so the 402 stays on the happy
 * path in both places at once: it is the quote step, and a page that folded it
 * away with the refusals would hide the single most important body on the
 * site. The response list opens these and leaves the rest closed.
 */
export const isExpectedAnswer = (status: string): boolean => {
  const tone = toneForStatus(status)
  return tone === 'ok' || tone === 'brand'
}
