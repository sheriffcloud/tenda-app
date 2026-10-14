/**
 * `grantsRemaining` — how a wei balance becomes the number an operator acts on
 * (#53b item 4).
 *
 * Pure, and separated from the monitor's integration suite because these are
 * arithmetic edges rather than query behaviour: a division that rounds the
 * wrong way, or one that divides by zero inside a delivery worker.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { grantsRemaining } from '@server/features/alerts'

const GRANT = 10n ** 16n

test('a whole multiple is exact', () => {
  assert.strictEqual(grantsRemaining(GRANT * 7n, GRANT), 7)
})

test('a partial grant is FLOORED, never rounded up', () => {
  // A wallet holding 1.9 grants can pay ONE user. Telling an operator "2 left"
  // when the second will fail is the failure this alert exists to prevent.
  assert.strictEqual(grantsRemaining(GRANT * 2n - 1n, GRANT), 1)
  assert.strictEqual(grantsRemaining(GRANT - 1n, GRANT), 0)
})

test('an empty wallet is zero, not a rounding artefact', () => {
  assert.strictEqual(grantsRemaining(0n, GRANT), 0)
})

test('a ZERO grant size answers 0 rather than dividing by zero', () => {
  // `gas_seed_amount_raw` is a nullable text column holding a numeric string —
  // nothing at the type level stops it being '0'. BigInt division by zero
  // THROWS, and this runs inside the delivery worker, so an unguarded divide
  // would burn the job's attempts and lose the alert.
  assert.strictEqual(grantsRemaining(GRANT * 5n, 0n), 0)
})

test('a negative grant size is refused rather than answering a negative count', () => {
  // Not reachable through the column today, and cheap to hold: a negative count
  // would compare BELOW any floor and alert forever.
  assert.strictEqual(grantsRemaining(GRANT, -1n), 0)
})

test('a balance far above any floor stays an exact integer', () => {
  // Number(bigint) is lossy past 2^53. A funded wallet is nowhere near that in
  // GRANTS — this pins that the conversion happens after the division, on the
  // small number, rather than before it on the wei figure.
  assert.strictEqual(grantsRemaining(GRANT * 1_000_000n, GRANT), 1_000_000)
})
