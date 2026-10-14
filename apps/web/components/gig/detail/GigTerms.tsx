/**
 * The listing terms, and ONLY the listing terms (comp lines 609-621).
 *
 * Party-scoped fields (counterparty, proofs, dispute) are deliberately never
 * read here: the public page renders identically whether the server withheld
 * them or the gig simply has none, so there is no code path where a leak
 * could become visible.
 */
import type { ReactNode } from 'react'
import {
  formatAssetAmount,
  formatDuration,
  gigPlaceLabel,
  type GigDetail,
} from '@tenda/shared'
import { ChainBadge } from '@/components/shared/ChainBadge'
import { RelativeTime } from '@/components/ui'
import { GIG_DETAIL_COPY } from './copy'

interface Term {
  label: string
  /**
   * A node rather than a string because "Posted" is a claim about the PRESENT
   * TENSE and has to stay true while the page sits open — see `RelativeTime`.
   * Every other term is a fixed fact and stays a plain string.
   */
  value: ReactNode
  /** Figures are set in mono with tabular numerals — the brief's one rule. */
  numeric?: boolean
}

/**
 * `Intl` with an explicit locale AND time zone, because this renders on the
 * server: with neither pinned, the deadline a reader sees is whatever locale
 * and `TZ` the node process happens to hold — so the same gig reads "8 Jan,
 * 14:00" in one deployment and "8 Jan, 15:00" in the next, with nothing on the
 * page to say which. Pinning them makes the rendered instant a property of the
 * data instead of the container.
 *
 * UTC and not a market zone: this page is one anonymous, cached-by-crawlers
 * document served to Lagos, Nairobi and Accra alike, and the render happens
 * before any reader's zone is known. `timeZoneName` is therefore NOT optional
 * — an unlabelled wall-clock time is the one version of this that can mislead.
 * Localising it to the reader would take a client enhancement over a
 * `<time dateTime>` element; until then, labelled UTC is the honest answer.
 */
const DEADLINE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
})

export function gigTerms(gig: GigDetail): Term[] {
  const terms: Term[] = [
    {
      label: GIG_DETAIL_COPY.terminology.payment,
      value: formatAssetAmount(gig.amount_raw, gig.asset),
      numeric: true,
    },
    // The shared badge (#60, correction c) — the same mark as the card and
    // the header, so the network reads alike wherever it is named.
    { label: GIG_DETAIL_COPY.terminology.chain, value: <ChainBadge chainId={gig.chain_id} /> },
    { label: GIG_DETAIL_COPY.terminology.location, value: gigPlaceLabel(gig) },
  ]
  if (gig.completion_duration_seconds !== null) {
    terms.push({
      label: GIG_DETAIL_COPY.terminology.deliverWithin,
      value: formatDuration(gig.completion_duration_seconds),
      numeric: true,
    })
  }
  if (gig.accept_deadline !== null) {
    terms.push({
      label: GIG_DETAIL_COPY.terminology.acceptingUntil,
      value: DEADLINE_FORMAT.format(new Date(gig.accept_deadline)),
      numeric: true,
    })
  }
  terms.push({
    label: GIG_DETAIL_COPY.terminology.posted,
    value: <RelativeTime iso={gig.created_at} />,
    numeric: true,
  })
  return terms
}

export function GigTerms({ gig }: { gig: GigDetail }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-x-8 gap-y-[22px]">
      {gigTerms(gig).map((term) => (
        <div key={term.label}>
          <dt className="mb-1 type-body-small text-content-tertiary">{term.label}</dt>
          {/* `break-words`: Location carries `city`, which is free text a
              poster typed. A 57-character place name painted 176px outside
              this 190px-minimum grid track and scrolled the whole document
              sideways — measured. The numeric terms are all bounded, but the
              rule is per-<dd> rather than per-term so a future term cannot
              opt out of it by accident. */}
          <dd
            className={`break-words font-semibold text-content-primary ${term.numeric ? 'font-numeric' : ''}`}
          >
            {term.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
