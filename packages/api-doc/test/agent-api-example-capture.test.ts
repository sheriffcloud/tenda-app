/**
 * #133 — the published 402 example carries a LOCAL NODE's addresses under a
 * Base Sepolia chain id, and the document must say so where the reader meets
 * the example.
 *
 * The recording is deliberately made on anvil (see agent-x402-recording
 * .anvil.test.ts: a fake relay would publish empty EIP-712 types and a zero
 * nonce). The cost is that `asset`, `pay_to` and `verifyingContract` in the
 * example are anvil's deterministic deployments. A reader who took them for
 * Base Sepolia's would sign a domain for a contract that does not exist.
 *
 * Two halves. The label: the operation names the example as a capture on a
 * local node and sends the reader to the registry for THIS deployment's
 * addresses. The reason the label is needed: the example's addresses really
 * are not the manifest's for that chain — so if the recording is ever re-made
 * against a fork (option (b) of #133) and they start to match, this fails and
 * the label gets rewritten rather than left as a stale warning.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { apiRoutes, findChain } from '@tenda/shared'
import { AGENT_API_DOCUMENT, RECORDED_EXCHANGE } from '../src'
import { plainProse } from '../src/testing/document-prose'

test('#133: the operation labels the example as a local-node capture and points at the registry for live addresses', () => {
  // Read through `plainProse`: the label is now a bold sentence and the four
  // field names are code spans, and a guard that matched the raw string would
  // be asserting the markdown rather than the warning.
  const description = plainProse(AGENT_API_DOCUMENT.paths[apiRoutes.agent.tasks]?.post?.description ?? '')
  assert.match(description, /capture, not defaults/)
  assert.match(description, /local node/)
  assert.match(description, /token and escrow addresses are that node's/)
  assert.match(description, new RegExp(`escrow_address for this deployment from get ${apiRoutes.platform.chains}`))
})

test('#133: the recorded addresses are NOT the manifest\'s for the chain id they carry — which is why the label exists', () => {
  const terms = RECORDED_EXCHANGE.payment_required.accepts[0]
  assert.ok(terms !== undefined)
  const manifest = findChain(terms.network)
  assert.ok(manifest !== undefined, `the recording names a manifest chain (${terms.network})`)
  const liveToken = manifest.assets.find((a) => a.id === terms.asset_id)?.token
  assert.ok(liveToken !== undefined && liveToken !== null, `${terms.asset_id} has a canonical token on ${terms.network}`)
  assert.notStrictEqual(
    terms.asset.toLowerCase(),
    liveToken.toLowerCase(),
    'the example now carries the LIVE token — re-recorded against a fork? Rewrite the capture label in paths-agent.ts (#133 option b)',
  )
  // The signed domain is the token: the reader-facing trap is exactly this field.
  assert.strictEqual(terms.payment.kind, 'eip155-authorization', 'the recording is an EVM exchange')
  if (terms.payment.kind === 'eip155-authorization') {
    assert.strictEqual(terms.payment.typed_data.domain.verifyingContract.toLowerCase(), terms.asset.toLowerCase())
  }
})
