/**
 * v2 escrow transaction-type vocabulary (snake_case — matches
 * `escrow_transactions.type` / `tx_attempts.action` enums and the
 * client-ping wire format). Single source shared by server and mobile so
 * the action names can never drift between the two.
 */
export const ESCROW_TX_TYPES = [
  'create',
  'accept',
  'decline',
  'assign_accept',
  'unassign',
  'submit',
  'approve',
  'claim_stalled',
  'cancel',
  'refund_expired',
  'reclaim_abandoned',
  'dispute',
  'resolve',
] as const

export type EscrowTxType = (typeof ESCROW_TX_TYPES)[number]

export function isEscrowTxType(v: unknown): v is EscrowTxType {
  return typeof v === 'string' && (ESCROW_TX_TYPES as readonly string[]).includes(v)
}

/**
 * Accept window stamped when a draft is (re)given a publish path: the
 * mobile create flows' default, the window fiat-rails stamps on
 * server-opened sell offers, and the refresh build-create applies to a
 * draft whose deadline lapsed before publishing.
 */
export const DEFAULT_ACCEPT_WINDOW_SECONDS = 7 * 24 * 60 * 60

/**
 * Seconds in an hour — the unit `ACCEPT_DEADLINE_OPTIONS` is authored in and
 * the wire is measured in. Named because #41 converts between the two in three
 * places (the bound, and each composer), and three loose `3600`s is how the
 * pickers and the API drift apart.
 */
export const SECONDS_PER_HOUR = 3_600

/**
 * Selectable accept-window options (in hours) for the create flows — how long
 * an escrow stays open for a counterparty to accept. Shared by the gig form and
 * the exchange offer form (both are escrows); the server only requires a future
 * timestamp, so this is purely the client's option set. '30d' is the long-tail
 * option that replaced the legacy 'No limit'.
 */
export const ACCEPT_DEADLINE_OPTIONS: readonly { label: string; hours: number }[] = [
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '48h', hours: 48 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
]

/**
 * Maximum digit count an `amount_raw` string may carry — mirrors the
 * `numeric(78,0)` precision of every amount column (db/schema/escrow.ts,
 * identity.ts, fiat.ts, …). Client-supplied amounts are length-checked
 * against this so an over-range value fails validation (422) up front
 * instead of overflowing the column at insert time (a postgres 500).
 */
export const AMOUNT_RAW_PRECISION = 78

/**
 * Canonical escrow status WIRE ORDER. The INDEX is the on-chain `uint8`
 * value on every chain — the EVM `Status` enum and the Anchor `EscrowStatus`
 * enum both number their variants in exactly this order. This is the single
 * app-side source the server decodes EVM receipts against; the
 * `check-contract-parity` guard asserts it equals both contracts' enums, so a
 * contract reorder (invisible to the ABI, which renders enums as bare `uint8`)
 * fails CI instead of silently mis-decoding.
 *
 * NOT a lifecycle sequence, and not a UI timeline. The array interleaves one
 * progressive path (open → accepted → submitted → completed) with four
 * TERMINAL states (cancelled, refunded, disputed, resolved) that branch off
 * wherever the escrow happens to be. Rendering this array in order implies
 * disputes follow completion, which is wrong. A timeline should draw the
 * progressive path as its spine and terminals as a branch from the current
 * node — the same reason there is no `expired`: expiry resolves to `refunded`,
 * which only makes sense as a branch.
 */
export const ESCROW_STATUS_ORDER = [
  'open',
  'accepted',
  'submitted',
  'completed',
  'cancelled',
  'refunded',
  'disputed',
  'resolved',
] as const

export type EscrowStatusName = (typeof ESCROW_STATUS_ORDER)[number]

/**
 * Statuses that count as POSTED — every status an escrow can hold once it
 * exists on-chain. `draft` is the sole off-chain status (a pre-signature
 * staging row that was never funded), so the posted set is exactly
 * `ESCROW_STATUS_ORDER`: a gig is "posted" when its create tx confirmed, not
 * when a draft row was written.
 *
 * Aliased rather than hand-listed so a new status can't be forgotten here.
 * The premise "draft is the only off-chain status" is pinned by
 * test/constants/escrow.ts against the DB enum, which fails if that ever
 * stops holding.
 *
 * Used as the `?status=` filter behind the My Gigs "Posted" tab and the
 * profile's posted count — both of which counted drafts before, so a
 * half-finished create inflated the number the user reads as "gigs I posted".
 */
export const POSTED_ESCROW_STATUSES = ESCROW_STATUS_ORDER

/**
 * Whether an escrow still has value held by the contract.
 *
 * `unsettled` means the on-chain balance has not been paid out or returned, so
 * the parties still need the chain to act on it. `settled` means the contract
 * has released everything and the row is history.
 *
 * A `Record` over every status rather than a hand-listed subset, and that is
 * the point: a ninth status added to `ESCROW_STATUS_ORDER` will not compile
 * until somebody classifies it here. The same reasoning as
 * `POSTED_ESCROW_STATUSES` being an alias — a subset that can be silently
 * out of date is worse than no subset, because the reader assumes it is total.
 *
 * Getting this wrong is not cosmetic. `boot-seed` counts unsettled escrows to
 * decide whether disabling a chain would strand people; a status wrongly
 * marked `settled` under-counts them and the guard waves the disable through.
 */
export const ESCROW_STATUS_SETTLEMENT: Record<EscrowStatusName, 'settled' | 'unsettled'> = {
  // Funded and awaiting an outcome — the contract still holds the amount.
  open: 'unsettled',
  accepted: 'unsettled',
  submitted: 'unsettled',
  disputed: 'unsettled',
  // Terminal: the contract has paid out or refunded, nothing left to release.
  completed: 'settled',
  cancelled: 'settled',
  refunded: 'settled',
  resolved: 'settled',
}

/**
 * Statuses where the contract still holds value. Derived from
 * `ESCROW_STATUS_SETTLEMENT` so the two can never disagree.
 *
 * `draft` is absent by construction: it is the sole off-chain status, never
 * funded, so it cannot strand anybody.
 */
export const UNSETTLED_ESCROW_STATUSES = ESCROW_STATUS_ORDER.filter(
  (s) => ESCROW_STATUS_SETTLEMENT[s] === 'unsettled',
)

/** Escrow kind → on-chain `uint8` (EVM `KIND_*`, Anchor `EscrowKind`). */
export const ESCROW_KIND_CODE = { gig: 0, exchange: 1 } as const

export type EscrowKindName = keyof typeof ESCROW_KIND_CODE

/** Dispute winner → on-chain `uint8` (EVM `WINNER_*`, Anchor `DisputeWinner`). */
export const DISPUTE_WINNER_CODE = { creator: 0, counterparty: 1, split: 2 } as const

export type DisputeWinnerName = keyof typeof DISPUTE_WINNER_CODE

/**
 * Protocol limits enforced ON-CHAIN by both contracts (EVM `TendaEscrow.sol`
 * constants + Anchor `constants.rs`). Single app-side source so off-chain
 * validation (e.g. the admin platform-config caps) can never be looser than
 * what the chain accepts — an over-limit value the contract would revert must
 * fail server-side first. The `check-contract-parity` guard asserts these
 * equal both contracts. Durations are in seconds.
 */
export const ESCROW_LIMITS = {
  maxPlatformFeeBps: 1000,
  minApprovalWindowSeconds: 3600,
  maxApprovalWindowSeconds: 30 * 24 * 60 * 60,
  maxGracePeriodSeconds: 14 * 24 * 60 * 60,
  minCompletionDurationSeconds: 3600,
  maxCompletionDurationSeconds: 180 * 24 * 60 * 60,
  minUnassignWindowSeconds: 0,
  maxUnassignWindowSeconds: 24 * 60 * 60,
} as const
