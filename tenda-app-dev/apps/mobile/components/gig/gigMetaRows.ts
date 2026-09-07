/**
 * WHICH facts the gig detail's card lists, and in what order — split from the
 * component so "what is worth saying about a gig" is readable and testable on
 * its own, and so the card file stays inside the size budget.
 *
 * Every row here is a claim the reader acts on: how long they have, where the
 * work is, by when, and which of THEIR wallets the escrow is bound to.
 */
import { MapPin, Clock, Calendar, Globe, Wallet } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import {
  BOUND_WALLET_LABEL,
  formatDuration,
  LOCATIONS,
  truncateWallet,
} from '@tenda/shared'
import type { CountryCode, EscrowStatus, GigDetail } from '@tenda/shared'

/**
 * Status-specific label for the single deadline row. The value itself comes
 * from computeRelevantDeadline upstream, which already picks the right
 * underlying deadline per status; this just names it so we never show both a
 * stale "Accept by" and a generic "Deadline". Statuses with no live deadline
 * are omitted (computeRelevantDeadline returns null → no row).
 */
const DEADLINE_LABEL: Partial<Record<EscrowStatus, string>> = {
  open: 'Accept by',
  accepted: 'Deliver by',
  submitted: 'Review by',
}

/** The subset of a gig these rows are built from. */
export type GigMetaSource = Pick<
  GigDetail,
  | 'city' | 'country' | 'remote'
  | 'completion_duration_seconds'
  | 'amount_raw' | 'asset' | 'status' | 'is_seeker'
  | 'my_signer_address'
>

export interface MetaRow {
  Icon: LucideIcon
  label: string
  value: string
  /** Overrides the default tertiary glyph colour (remote gigs get the brand). */
  iconTint?: string
}

export function gigMetaRows(
  gig: GigMetaSource,
  deadlineLbl: string | null,
  /** Tint for the remote glyph — passed in so this module stays theme-free. */
  remoteTint: string,
): MetaRow[] {
  const rows: MetaRow[] = []

  if (gig.completion_duration_seconds !== null) {
    rows.push({
      Icon: Calendar,
      label: 'Deliver within',
      value: formatDuration(gig.completion_duration_seconds),
    })
  }

  // Remote gigs carry no location (country/city are null); physical gigs always
  // have both. So: "Remote" or the work location, "City, Country".
  const workCountry = gig.country ? (LOCATIONS[gig.country as CountryCode]?.name ?? gig.country) : null
  rows.push({
    Icon: gig.remote ? Globe : MapPin,
    label: 'Location',
    value: gig.remote ? 'Remote' : ([gig.city, workCountry].filter(Boolean).join(', ') || '—'),
    iconTint: gig.remote ? remoteTint : undefined,
  })

  // One status-aware deadline row (open → "Accept by", accepted → "Deliver by",
  // submitted → "Review by"); replaces the old duplicate "Accept by" + generic
  // "Deadline" pair, which showed the same moment on open and a stale accept
  // deadline once the gig moved on.
  const deadlineRowLabel = DEADLINE_LABEL[gig.status]
  if (deadlineLbl && deadlineRowLabel) {
    rows.push({
      Icon: Clock,
      label: deadlineRowLabel,
      value: deadlineLbl,
    })
  }

  // Which of the reader's wallets THIS escrow is bound to. Viewer-relative on
  // the wire — only a party is ever sent an address, and only their own — so
  // showing it needs no viewer logic here. It matters most to the party who
  // never chose it: an assigned worker's wallet was baked by the poster's
  // assign, and the first they would otherwise hear of it is a refused
  // signature.
  if (gig.my_signer_address !== null) {
    rows.push({
      Icon: Wallet,
      label: BOUND_WALLET_LABEL,
      value: truncateWallet(gig.my_signer_address),
    })
  }

  return rows
}
