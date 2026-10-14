/**
 * A wire type may not promise a null the COLUMN cannot produce.
 *
 * `created_at` is NOT NULL with a default on every table in the schema, yet
 * eight wire types declared `created_at: string | null`; GigSummary, the ninth,
 * was fixed the same way by #26. The cost is not cosmetic: every client then
 * carries a branch for
 * a value that never arrives — a conditional render, a `?? null`, a day-grouping
 * walker with a whole "undated notice" case — and those branches are untestable
 * except by fabricating a row the server cannot send. Three such tests existed,
 * each asserting behaviour for an impossible input.
 *
 * This binds the two halves so neither can drift alone:
 *
 *   COMPILE TIME  `RefusesNull<T>` makes the type an error object when `T`
 *                 admits null, so re-widening a wire type stops the build of
 *                 every package that consumes it.
 *   RUN TIME      the column really is NOT NULL, read off the Drizzle schema
 *                 rather than restated here.
 *
 * So: widen the column and the runtime half fails, naming the type to widen.
 * Widen the type and the compile half fails. Neither can move quietly.
 *
 * The Agent API's own document has an equivalent guard
 * (`test/unit/agent-api-document.test.ts`, "the document allows null exactly
 * where the DATABASE does"), but it can only cover schemas that document
 * publishes — and none of the types below reach it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  conversations,
  escrow_transactions,
  escrows,
  gig_subscriptions,
  messages,
  notifications,
  users,
} from '../../src/db/schema'
import type { Conversation, Message, GigSubscription } from '../../src/types/chat'
import type { UserEscrowTransaction, EscrowListRow } from '../../src/types/escrow'
import type { NotificationWire } from '../../src/types/notification'
import type { ExchangeSummary } from '../../src/types/exchange'
import type { GigSummary } from '../../src/types/gig'
import type { MeUser } from '../../src/api/contracts/users.contract'

/**
 * `T` unless it admits null, in which case an object no string is assignable
 * to — so the assignment below stops compiling and says why.
 */
type RefusesNull<T> = [null] extends [T]
  ? { ERROR: 'this wire field admits null, but its column is NOT NULL' }
  : T

const ISO = '2026-08-15T12:00:00.000Z'

/** How many wire types this file binds — asserted on BOTH halves so neither can lose one silently. */
const EXPECTED_TYPES = 9

/** Wire type → the table its `created_at` is projected from. */
const BACKING_TABLE = {
  Conversation: conversations,
  Message: messages,
  GigSubscription: gig_subscriptions,
  UserEscrowTransaction: escrow_transactions,
  // Exchange offers ARE escrows (kind='exchange'), and both listing rows and
  // the gig summary project the same escrows.created_at.
  EscrowListRow: escrows,
  ExchangeSummary: escrows,
  GigSummary: escrows,
  NotificationWire: notifications,
  // Not in the original ticket: found by sweeping all of shared/src rather than
  // just src/types. /v1/users/me spreads the row, so this reaches the wire as a
  // JSON-serialised ISO string and is never null.
  MeUser: users,
} as const

test('no wire type admits null where its column does not', () => {
  // These assignments ARE the assertion, and they are checked by `tsc`, not at
  // run time: `RefusesNull` turns each type into an error object the moment the
  // wire type is re-widened, and an error object is not assignable to a string.
  // They live inside a test rather than at module scope so a failure is a named
  // test failure, not an exception thrown while the file is being imported —
  // which would take the rest of this file's tests down with it.
  const bound: string[] = [
    ((v: RefusesNull<Conversation['created_at']>) => v)(ISO),
    ((v: RefusesNull<Message['created_at']>) => v)(ISO),
    ((v: RefusesNull<GigSubscription['created_at']>) => v)(ISO),
    ((v: RefusesNull<UserEscrowTransaction['created_at']>) => v)(ISO),
    ((v: RefusesNull<EscrowListRow['created_at']>) => v)(ISO),
    ((v: RefusesNull<NotificationWire['created_at']>) => v)(ISO),
    ((v: RefusesNull<ExchangeSummary['created_at']>) => v)(ISO),
    ((v: RefusesNull<GigSummary['created_at']>) => v)(ISO),
    ((v: RefusesNull<MeUser['created_at']>) => v)(ISO),
  ]
  assert.equal(bound.length, EXPECTED_TYPES, 'one compile-time check per backing-table entry')
  assert.ok(bound.every((v) => v === ISO))
})

test('every wire type whose created_at is non-null projects a NOT NULL column', () => {
  const checked: string[] = []
  for (const [wireType, table] of Object.entries(BACKING_TABLE)) {
    const column = table.created_at
    assert.equal(
      column.notNull,
      true,
      `${wireType}.created_at is declared non-null on the wire, but ${column.name} is NULLABLE — ` +
        'widen the wire type and restore its clients\' null handling, or make the column NOT NULL',
    )
    checked.push(wireType)
  }
  // The loop proves nothing if the table is empty or an entry silently vanished.
  assert.equal(checked.length, EXPECTED_TYPES, 'a backing-table entry vanished')
  assert.ok(checked.includes('GigSummary'), '#26 fixed GigSummary; it stays covered here')
})

test('the compile-time half is load bearing: RefusesNull rejects a nullable field', () => {
  // Proves the guard above is not vacuous — if RefusesNull resolved to `T` for
  // everything, the assignments above would compile for a nullable type too.
  type Nullable = { created_at: string | null }
  type Guarded = RefusesNull<Nullable['created_at']>
  const probe: Guarded = { ERROR: 'this wire field admits null, but its column is NOT NULL' }
  assert.equal(probe.ERROR, 'this wire field admits null, but its column is NOT NULL')
})
