import { useHealth } from '@/hooks/useHealth'
import { Pill } from '@/components/ui/Pill'
import { FOOTER_LEGAL } from './content'

/**
 * The status chip in the legal row. Polls /v1/health on mount: a LiveChip
 * reading "Systems normal" when the public surface answers, and an honest
 * "Degraded" or "Unavailable" — with the dot in the danger tone — when it
 * does not. Real data, no placeholders.
 */
export function FooterStatus() {
  const { data, loading, error } = useHealth()
  const ok = !!data && data.status === 'ok'
  const label = loading
    ? FOOTER_LEGAL.status.checking
    : ok
      ? FOOTER_LEGAL.status.ok
      : error
        ? FOOTER_LEGAL.status.down
        : FOOTER_LEGAL.status.degraded

  return (
    <Pill tone={ok ? 'live' : loading ? 'neutral' : 'danger'} dot={!loading} pulse={ok}>
      {label}
    </Pill>
  )
}
