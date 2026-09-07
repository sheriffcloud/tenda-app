/**
 * The three escrow party predicates, pinned by the COLUMNS each one tests.
 *
 * They exist because that distinction was previously spread across eight
 * hand-written `or(...)` expressions with nothing naming it, and the failure
 * mode is silent: swapping one for another still compiles, still returns rows,
 * and just quietly widens or narrows who can see an escrow. So this asserts
 * the column sets rather than trusting the names.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isEscrowParty,
  isEscrowPartyOrAssigned,
  isEscrowCounterpartySide,
  isEscrowPartyRow,
  isEscrowPartyOrAssignedRow,
  type EscrowPartyColumns,
} from '@server/lib/escrow-party'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'

/** Column names referenced by a built Drizzle condition, in order. */
function columnsOf(sql: { queryChunks: unknown[] }): string[] {
  const names: string[] = []
  const walk = (chunk: unknown): void => {
    if (Array.isArray(chunk)) {
      chunk.forEach(walk)
      return
    }
    if (chunk === null || typeof chunk !== 'object') return
    const c = chunk as { name?: unknown; queryChunks?: unknown[] }
    if (typeof c.name === 'string' && !names.includes(c.name)) names.push(c.name)
    if (Array.isArray(c.queryChunks)) c.queryChunks.forEach(walk)
  }
  walk(sql.queryChunks)
  return names
}

test('isEscrowParty covers the settled party columns ONLY', () => {
  const cols = columnsOf(isEscrowParty(USER))
  assert.deepEqual(cols.sort(), ['counterparty_id', 'creator_id'])
  // The pre-accept column must NOT leak in: it would let a direct-offer
  // invitee who never accepted read a wallet feed and block wallet unlink.
  assert.ok(!cols.includes('assigned_counterparty_id'))
})

test('isEscrowPartyOrAssigned adds the pending-assignment column', () => {
  const cols = columnsOf(isEscrowPartyOrAssigned(USER))
  assert.deepEqual(cols.sort(), [
    'assigned_counterparty_id',
    'counterparty_id',
    'creator_id',
  ])
})

test('isEscrowCounterpartySide excludes the creator', () => {
  const cols = columnsOf(isEscrowCounterpartySide(USER))
  assert.deepEqual(cols.sort(), ['assigned_counterparty_id', 'counterparty_id'])
  // The whole point of the "gigs I'm working on" filter is to drop escrows
  // the caller posted; including creator_id would fold the two tabs into one.
  assert.ok(!cols.includes('creator_id'))
})

test('the three predicates are genuinely distinct', () => {
  const party = columnsOf(isEscrowParty(USER)).sort().join()
  const assigned = columnsOf(isEscrowPartyOrAssigned(USER)).sort().join()
  const worker = columnsOf(isEscrowCounterpartySide(USER)).sort().join()
  assert.notEqual(party, assigned)
  assert.notEqual(party, worker)
  assert.notEqual(assigned, worker)
})

/** Bound parameter values in a built condition (Drizzle `Param.value`). */
function paramsOf(sql: { queryChunks: unknown[] }): unknown[] {
  const out: unknown[] = []
  const seen = new Set<unknown>()
  const walk = (chunk: unknown): void => {
    if (Array.isArray(chunk)) {
      chunk.forEach(walk)
      return
    }
    if (chunk === null || typeof chunk !== 'object' || seen.has(chunk)) return
    seen.add(chunk)
    const c = chunk as { value?: unknown; queryChunks?: unknown[] }
    if ('value' in c) out.push(c.value)
    if (Array.isArray(c.queryChunks)) c.queryChunks.forEach(walk)
  }
  walk(sql.queryChunks)
  return out
}

test('each predicate binds the caller id once per column it tests', () => {
  for (const build of [isEscrowParty, isEscrowPartyOrAssigned, isEscrowCounterpartySide]) {
    const sql = build(USER)
    const bound = paramsOf(sql).filter((v) => v === USER)
    assert.equal(bound.length, columnsOf(sql).length)
  }
})

test('predicates bind the id given, not a captured one', () => {
  const other = '22222222-2222-4222-8222-222222222222'
  assert.ok(paramsOf(isEscrowParty(other)).includes(other))
  assert.ok(!paramsOf(isEscrowParty(other)).includes(USER))
})

// ── row-level twins ─────────────────────────────────────────────────────────
//
// Same column sets, evaluated against a loaded row instead of compiled to SQL.
// They back the escrow detail routes' disclosure gate, where getting the set
// wrong leaks a counterparty's profile and a worker's proof files rather than
// merely returning the wrong rows.

/** An escrow where exactly ONE membership column names USER. */
function escrowWith(column: keyof EscrowPartyColumns): EscrowPartyColumns {
  return {
    creator_id: column === 'creator_id' ? USER : OTHER,
    counterparty_id: column === 'counterparty_id' ? USER : null,
    assigned_counterparty_id: column === 'assigned_counterparty_id' ? USER : null,
  }
}

const ALL_COLUMNS: (keyof EscrowPartyColumns)[] = [
  'creator_id',
  'counterparty_id',
  'assigned_counterparty_id',
]

test('each row predicate reads EXACTLY the columns its SQL twin does', () => {
  // THE anti-drift assertion, and the reason both representations now live in
  // one module over one column list: a query-level and a row-level answer that
  // disagree about who is a party is a leak on one side or a lockout on the
  // other, and nothing else in the suite would notice.
  const twins = [
    { sql: isEscrowParty, row: isEscrowPartyRow, name: 'isEscrowParty' },
    { sql: isEscrowPartyOrAssigned, row: isEscrowPartyOrAssignedRow, name: 'isEscrowPartyOrAssigned' },
  ]
  for (const { sql, row, name } of twins) {
    const sqlColumns = columnsOf(sql(USER))
    for (const column of ALL_COLUMNS) {
      assert.equal(
        row(escrowWith(column), USER),
        sqlColumns.includes(column),
        `${name}: row and SQL disagree about ${column}`,
      )
    }
  }
})

test('row predicates: a stranger matches nothing', () => {
  for (const column of ALL_COLUMNS) {
    assert.equal(isEscrowPartyRow(escrowWith(column), OTHER + 'x'), false)
    assert.equal(isEscrowPartyOrAssignedRow(escrowWith(column), OTHER + 'x'), false)
  }
})

test('row predicates: an anonymous (null) caller never matches a null column', () => {
  // Both nullable columns are null here. Without the explicit null guard,
  // `escrow.counterparty_id === user_id` would be `null === null` — every
  // anonymous reader on the internet a party to every unclaimed escrow.
  const unclaimed: EscrowPartyColumns = {
    creator_id: OTHER,
    counterparty_id: null,
    assigned_counterparty_id: null,
  }
  assert.equal(isEscrowPartyRow(unclaimed, null), false)
  assert.equal(isEscrowPartyOrAssignedRow(unclaimed, null), false)
})

test('row predicates take an id and no role, so no stale role can widen them', () => {
  // The public gig detail reaches these through `identifyViewer`, whose role
  // claim can be a token lifetime out of date. Two parameters is the pin.
  assert.equal(isEscrowPartyRow.length, 2)
  assert.equal(isEscrowPartyOrAssignedRow.length, 2)
})
