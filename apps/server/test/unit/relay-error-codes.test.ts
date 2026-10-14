/**
 * #143 — one code per condition. RELAY_UNAVAILABLE used to be thrown at 422
 * (this ASSET cannot fund by signature) and at 503 (this CHAIN has no
 * relayer); a client could not branch on the code, and the round-three
 * reviewer said so. The asset case is RELAY_UNSUPPORTED_ASSET now. Codes are
 * append-only (x-tenda-stability), so this is additive.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { ErrorCode, apiRoutes } from '@tenda/shared'
import { AGENT_API_DOCUMENT } from '@tenda/api-doc'

test('#143: the two relay refusals carry two codes, and the document assigns each to exactly one status', () => {
  assert.strictEqual(ErrorCode.RELAY_UNAVAILABLE, 'RELAY_UNAVAILABLE')
  assert.strictEqual(ErrorCode.RELAY_UNSUPPORTED_ASSET, 'RELAY_UNSUPPORTED_ASSET')
  const tasks = AGENT_API_DOCUMENT.paths[apiRoutes.agent.tasks]?.post
  const at422 = tasks?.responses['422']?.description ?? ''
  const at503 = tasks?.responses['503']?.description ?? ''
  assert.match(at422, /RELAY_UNSUPPORTED_ASSET/)
  assert.doesNotMatch(at422, /RELAY_UNAVAILABLE/, 'the chain-level code must not be promised at 422 any more')
  assert.match(at503, /RELAY_UNAVAILABLE/)
  assert.doesNotMatch(at503, /RELAY_UNSUPPORTED_ASSET/)
  // The closed ApiError vocabulary is derived from the enum, so the new code is
  // publishable without a second list to keep in step.
  const codes = AGENT_API_DOCUMENT.components.schemas.ApiError.properties?.code.enum ?? []
  assert.ok(codes.includes('RELAY_UNSUPPORTED_ASSET'))
  assert.ok(codes.includes('RELAY_UNAVAILABLE'))
})
