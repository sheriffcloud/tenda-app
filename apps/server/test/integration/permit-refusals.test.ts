/**
 * A permit signature that is well-formed but not a SIGNATURE, through both
 * routes that accept one (#107).
 *
 * THE BUG. `parsePermitSignature` checked the shape — 65 bytes of 0x-hex — and
 * handed the string to viem, which throws a plain Error for a recovery byte
 * outside {0, 1, 27, 28}, as does noble for an r or s outside the curve order.
 * A plain Error is not an AppError, so the envelope rendered it as 500
 * INTERNAL_ERROR: "An unexpected error occurred" for what is a bad request, on
 * the money path, from input a wallet produced. It also pages whoever watches
 * 5xx rates.
 *
 * WHY BOTH ROUTES. `validateWirePermit` is shared by create and dispute exactly
 * so the rules cannot drift, and this file is what proves the sharing is real
 * rather than intended: the same body gets the same refusal from each. The
 * field-level rules themselves are unit-tested in test/unit/evm-permit.test.ts —
 * these two cases assert the shared validator is REACHED, not what it decides.
 *
 * NOTE ON THE CHAIN. Both routes validate the permit body BEFORE the eip155
 * namespace check (create inside validateCreateEscrow, dispute at its line 62),
 * so the harness's Solana escrow reaches this code — which is also why the
 * defect was reachable in the first place. A signature that PARSES gets the
 * namespace refusal instead, and each case below asserts that too: same status,
 * different message, so only the message says which guard answered.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import type { PermitSignatureBody } from '@tenda/shared'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  authHeader,
} from '../helpers/test-app'
import { createEscrowBody, partiedEscrow } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** 64 bytes of r and s that are inside the curve order; only the tail varies. */
const R_AND_S = `${'11'.repeat(32)}${'22'.repeat(32)}`
/** Recovery byte 0x11 = 17: hex-valid, 65 bytes, and not a recovery id. */
const UNPARSEABLE = `0x${R_AND_S}11`
/** 0x1b = 27, the legacy recovery id every EIP-2612 wallet emits. */
const PARSEABLE = `0x${R_AND_S}1b`

const NOT_A_SIGNATURE = /permit\.signature is not a valid signature/
const NOT_ON_THIS_CHAIN = /permit is not supported on/

function permitBody(signature: string): PermitSignatureBody {
  return {
    value_raw: '1000000',
    deadline_unix: Math.floor(Date.now() / 1000) + 3_600,
    signature,
  }
}

test('POST /v1/escrows: an unparseable permit signature is 422, not 500', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)

  const refused = await app.inject({
    method: 'POST',
    url: '/v1/escrows',
    headers: authHeader(creator.token),
    payload: createEscrowBody({ permit: permitBody(UNPARSEABLE) }),
  })
  assert.strictEqual(refused.statusCode, 422, refused.body)
  assert.strictEqual(refused.json().code, 'VALIDATION_ERROR')
  assert.match(refused.json().message, NOT_A_SIGNATURE)

  // The control: change ONLY the recovery byte and the request gets past the
  // signature check, far enough to be refused for the chain it names. Both are
  // 422, so this is what says the case above is about the signature.
  const parsed = await app.inject({
    method: 'POST',
    url: '/v1/escrows',
    headers: authHeader(creator.token),
    payload: createEscrowBody({ permit: permitBody(PARSEABLE) }),
  })
  assert.strictEqual(parsed.statusCode, 422, parsed.body)
  assert.match(parsed.json().message, NOT_ON_THIS_CHAIN)
})

test('POST /v1/escrows/:id/dispute: the same signature, the same 422', { skip }, async () => {
  // The second call site of the shared validator. Everything else about this
  // request is valid — party, status, bond and reason — so the refusal can only
  // come from the permit.
  const app = getApp()
  const { creator, escrow } = await partiedEscrow(app, 'accepted')

  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/dispute`,
    headers: authHeader(creator.token),
    payload: {
      reason: 'The delivered work does not match what was agreed at all.',
      bond_raw: '1000000',
      permit: permitBody(UNPARSEABLE),
    },
  })
  assert.strictEqual(res.statusCode, 422, res.body)
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
  assert.match(res.json().message, NOT_A_SIGNATURE)

  // The parseable control for THIS route is escrow-refusals.test.ts's 'a permit
  // on a non-EVM chain is 422', which sends the same body with a valid recovery
  // byte and gets the namespace refusal. Not repeated here.
})
