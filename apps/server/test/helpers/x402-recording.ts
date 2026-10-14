/**
 * Comparing a published recording against a fresh capture, and re-writing it
 * when the wire deliberately changed (#109).
 *
 * The recording's whole value is that it cannot drift, and that property is
 * only as good as the comparison. Two things can go stale in it: the SHAPE (a
 * field the server added, renamed or dropped) and the STABLE VALUES (a scheme
 * name, an error string, a status). Both are checked. What cannot be checked
 * is anything that is different by design on every run — a fresh uuid, a
 * deadline computed from now, a signature over a random key — and those are
 * named one by one in `VOLATILE` rather than skipped by a loose match, so a
 * field that becomes unstable has to be added here deliberately.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RecordedExchange } from '@tenda/api-doc'

/**
 * Dotted paths whose VALUE differs every run and is therefore compared only
 * for presence and type. Array indices appear as `[0]`.
 *
 * Each is here for a stated reason; none is here to make a failure go away.
 */
export const VOLATILE: readonly string[] = [
  // Fresh per call, by design.
  'request.creation_operation_id',
  'payment_required.task_id',
  'payment_required.accepts[0].escrow_id',
  'payment_required.accepts[0].payment.create_params.escrowId',
  'created.task_id',
  // Derived from `now` at quote time.
  'payment_required.accepts[0].expires_at_unix',
  'payment_required.accepts[0].payment.create_params.acceptDeadline',
  'payment_required.accepts[0].payment.typed_data.message.validBefore',
  'payment_envelope.payload.authorization.validBefore',
  // The recorder's agent is a fresh key each run.
  'payment_required.accepts[0].payment.creator',
  'payment_required.accepts[0].payment.typed_data.message.from',
  'payment_envelope.payload.authorization.from',
  'settlement.payer',
  // Bound to the escrow id above, so fresh with it.
  'payment_required.accepts[0].payment.typed_data.message.nonce',
  'payment_envelope.payload.authorization.nonce',
  // Signature over all of the above; and the hash of the transaction it funded.
  'payment_envelope.payload.signature',
  'created.tx_ref',
  'settlement.transaction',
  // The POLL (#97). These four are the ones the guard itself named on a second
  // run — not a guess: the escrow id and the agent's user row are fresh per
  // capture, and both timestamps are derived from `now` at create time. Every
  // OTHER field of the polled gig is pinned, which is the point: `status`,
  // `creator.is_agent`, the proof requirements and the null party-scoped half
  // are exactly what a reader is being shown, and a change in any of them
  // should fail here.
  'polled.escrow_id',
  'polled.created_at',
  'polled.accept_deadline',
  'polled.creator.id',
]

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

const typeOf = (value: Json): string =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value

/**
 * Every way `live` departs from `recorded`, as readable lines. Empty means the
 * published example still describes what the server sends.
 */
function walk(recorded: Json, live: Json, path: string, volatile: ReadonlySet<string>, out: string[]): void {
  if (typeOf(recorded) !== typeOf(live)) {
    out.push(`${path}: recorded ${typeOf(recorded)}, server now sends ${typeOf(live)}`)
    return
  }
  if (Array.isArray(recorded) && Array.isArray(live)) {
    if (recorded.length !== live.length) {
      out.push(`${path}: recorded ${recorded.length} item(s), server now sends ${live.length}`)
      return
    }
    recorded.forEach((item, index) => walk(item, live[index] as Json, `${path}[${index}]`, volatile, out))
    return
  }
  if (typeof recorded === 'object' && recorded !== null && typeof live === 'object' && live !== null) {
    const recordedKeys = Object.keys(recorded).sort()
    const liveKeys = Object.keys(live as object).sort()
    const missing = recordedKeys.filter((key) => !liveKeys.includes(key))
    const added = liveKeys.filter((key) => !recordedKeys.includes(key))
    if (missing.length > 0) out.push(`${path}: the server no longer sends ${missing.join(', ')}`)
    if (added.length > 0) out.push(`${path}: the server now also sends ${added.join(', ')}`)
    for (const key of recordedKeys.filter((k) => liveKeys.includes(k))) {
      walk(
        (recorded as Record<string, Json>)[key] as Json,
        (live as Record<string, Json>)[key] as Json,
        path === '' ? key : `${path}.${key}`,
        volatile,
        out,
      )
    }
    return
  }
  // A leaf. Volatile leaves have already had their type checked above.
  if (volatile.has(path)) return
  if (recorded !== live) out.push(`${path}: recorded ${JSON.stringify(recorded)}, server now sends ${JSON.stringify(live)}`)
}

/** Differences between the published recording and a fresh capture; `[]` when it still holds. */
export function sameShape(recorded: RecordedExchange, live: RecordedExchange, volatile: readonly string[]): string[] {
  const out: string[] = []
  walk(
    JSON.parse(JSON.stringify(recorded)) as Json,
    JSON.parse(JSON.stringify(live)) as Json,
    '',
    new Set(volatile),
    out,
  )
  return out
}

// The document lives in `packages/api-doc` since #157, so the writer reaches
// OUT of this package. A stale path here would not fail anything: `pnpm
// record:x402` would happily create `apps/server/src/agent-api/` again and
// write a recording nothing imports.
export const RECORDING_PATH = join(
  __dirname, '..', '..', '..', '..', 'packages', 'api-doc', 'src', 'recorded-exchange.ts',
)

/**
 * Re-write the published recording from a live capture.
 *
 * Deliberately NOT part of the ordinary run: it is reached only through
 * `pnpm record:x402`, so a wire change fails the guard first and is re-recorded
 * on purpose rather than silently absorbed by the suite that was supposed to
 * catch it.
 */
export function writeRecording(live: RecordedExchange): void {
  const header = `/**
 * GENERATED — do not edit. One real x402 exchange, captured through the real
 * route against a real node by
 * test/integration/agent-x402-recording.anvil.test.ts, and published inline in
 * the Agent API document by ./examples.
 *
 * Re-record with \`pnpm record:x402\` after a DELIBERATE wire change. Editing
 * this file by hand defeats the only property it has: that a reader is looking
 * at something the server actually sent.
 *
 * Captured ${new Date().toISOString().slice(0, 10)}.
 */
import type { RecordedExchange } from './examples'

export const RECORDED_EXCHANGE: RecordedExchange = `
  writeFileSync(RECORDING_PATH, `${header}${JSON.stringify(live, null, 2)}\n`)
}
