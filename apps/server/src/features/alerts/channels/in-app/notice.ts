/**
 * What one kind's in-app copy produces.
 *
 * DERIVED from `ManyNotificationInput` rather than declared beside it, so the
 * shape a kind writes and the shape the fan-out accepts are the same type. A
 * hand-listed `{ title, body, data }` would compile identically today and drift
 * the moment lib/notify grows a field — which is exactly how `escrowId` once
 * became `escrow_id` at one of nine call sites (see the notify docstring).
 *
 * `idFor` and `persist` are excluded deliberately: they are DELIVERY decisions,
 * not copy. The channel owns both — every alert persists (a bell row is the
 * whole point) and the id is derived from the alert's identity, not from
 * anything a kind's wording knows.
 *
 * Its own module rather than a type in ./copy: the kinds import this, and
 * ./copy imports the kinds, so declaring it there would close a cycle.
 */

import type { ManyNotificationInput } from '@server/lib/notify'

export type InAppNotice = Pick<ManyNotificationInput, 'title' | 'body' | 'data'>
