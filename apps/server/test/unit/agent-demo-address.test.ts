/**
 * Whether a deployment can offer a demo at all (#108) — the pure half.
 *
 * It is pure so that all three answers can be covered in one process:
 * `getConfig()` memoises on its first read, so the wire-level cases need a
 * suite each, and only the decision itself can be exercised exhaustively here.
 *
 * The MALFORMED case is the one worth having. An unset address fails at the
 * door and names itself; a typo'd one does not — the session is minted, the
 * account and wallet row are created, and the failure surfaces later, deeper,
 * and somewhere that does not mention `AGENT_DEMO_ADDRESS` at all.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoAddress } from '@server/features/agent/demo/demoSession'

test('a well-formed address is usable, in either case the operator pasted', () => {
  const lower = `0x${'ab'.repeat(20)}`
  assert.deepStrictEqual(demoAddress(lower), { ok: true, address: lower })
  // Block explorers hand out the EIP-55 checksummed form; it is accepted HERE
  // and normalised at the create seam, not rejected for its capitals.
  const checksummed = '0xD0d0D0d0D0d0D0d0D0d0D0d0D0d0D0d0D0d0D0d0'
  assert.deepStrictEqual(demoAddress(checksummed), { ok: true, address: checksummed })
})

test('an unset address is a reason, not a crash — and a DIFFERENT reason from a malformed one', () => {
  const unset = demoAddress(null)
  const malformed = demoAddress('0xnope')
  assert.strictEqual(unset.ok, false)
  assert.strictEqual(malformed.ok, false)
  assert.ok(unset.ok === false && /AGENT_DEMO_ADDRESS/.test(unset.reason), 'the reason must name the variable')
  // The two faults need different fixes — set it, versus correct it — so an
  // operator has to be able to tell them apart. Deliberately NOT pinned to any
  // particular wording: an assertion whose only failure mode is a rewrite
  // guards nothing, and a mutation sweep proved this one did exactly that.
  assert.notStrictEqual(
    unset.ok === false ? unset.reason : '',
    malformed.ok === false ? malformed.reason : '',
    'both misconfigurations answer with the same sentence — the operator cannot tell which they have',
  )
})

test('every malformed shape an operator can paste is refused', () => {
  // Each of these is a real slip: a truncated copy, a stray space, the wrong
  // chain's address format, an empty override, a 0x with nothing after it.
  const bad = [
    '',
    'not-an-address',
    '0x',
    `0x${'ab'.repeat(19)}`,
    `0x${'ab'.repeat(21)}`,
    ` 0x${'ab'.repeat(20)}`,
    `0x${'ab'.repeat(20)} `,
    '4Nd1mYvK4Pm1x2HCmzCx5GQDV9KbpMK128bxgL5dVDU1',
    `0x${'zz'.repeat(20)}`,
  ]
  for (const value of bad) {
    const answer = demoAddress(value)
    assert.strictEqual(answer.ok, false, `${JSON.stringify(value)} was accepted as an EVM address`)
    assert.ok(answer.ok === false && /AGENT_DEMO_ADDRESS/.test(answer.reason))
  }
})
