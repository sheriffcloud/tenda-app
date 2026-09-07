/**
 * Filter narrowing for GET /v1/admin/disputes.
 *
 * Every one of these used to fail OPEN: an unrecognised value fell through the
 * `if` that consumed it and the query ran unfiltered, so a typo returned the
 * WHOLE queue — resolved disputes included — while the dashboard still showed
 * the filter as applied. That reads as "nothing to triage here" rather than as
 * an error. Mirrors admin/resolutions.ts, which has always rejected.
 *
 * Lives beside the route rather than in it so adding a filter costs one line
 * there and its vocabulary stays declarative.
 */
import { escrowKindEnum } from '@tenda/shared/db/schema/escrow'
import {
  DISPUTE_LIST_ASSIGNED,
  DISPUTE_LIST_STATUSES,
  ErrorCode,
  type DisputeListAssigned,
  type DisputeListStatus,
  type EscrowKind,
} from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { isUuidLike } from '@server/lib/uuid'

/**
 * `undefined` for an absent filter, the narrowed value for a legal one, and a
 * 400 for anything else.
 *
 * An EMPTY string counts as absent: a UI that serialises a cleared filter as
 * `?status=` is asking for everything, not making a mistake. Every narrower
 * below follows that rule, `party` included.
 */
function narrowFilter<T extends string>(
  field: string,
  allowed: readonly T[],
  value: string | undefined,
): T | undefined {
  if (value === undefined || value === '') return undefined
  const match = allowed.find((a) => a === value)
  if (match === undefined) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, `${field} must be one of: ${allowed.join(', ')}`)
  }
  return match
}

export const narrowDisputeStatus = (v: string | undefined): DisputeListStatus | undefined =>
  narrowFilter('status', DISPUTE_LIST_STATUSES, v)

/**
 * Narrowed against the pgEnum `EscrowKind` itself derives from, so the
 * validator cannot drift from the type the way a hand-written list would.
 */
export const narrowDisputeKind = (v: string | undefined): EscrowKind | undefined =>
  narrowFilter('kind', escrowKindEnum.enumValues, v)

export const narrowDisputeAssigned = (v: string | undefined): DisputeListAssigned | undefined =>
  narrowFilter('assigned', DISPUTE_LIST_ASSIGNED, v)

/**
 * `party` has no vocabulary — it is a user id — so it is shape-checked
 * instead. Unchecked it reached postgres as a `uuid` comparison and threw
 * `invalid input syntax for type uuid`, surfacing as a 500: the caller was
 * told the server is broken when in fact their input was malformed.
 *
 * A 400 rather than an empty page, because "no such user" and "that is not a
 * user id" are different answers, and silently returning zero disputes is the
 * same silent-wrong-answer the enum filters used to give.
 */
export function narrowDisputeParty(v: string | undefined): string | undefined {
  if (v === undefined || v === '') return undefined
  if (!isUuidLike(v)) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'party must be a uuid')
  }
  return v
}
