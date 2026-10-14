/**
 * The 402 → sign → 201 → poll lifecycle, stated where the reader meets it
 * (#144 document half, #146 parts 1 and 3).
 *
 * Round three's one clause — "explicit handling for a relayed transaction that
 * never confirms" — was true: the recovery existed (verify-tx fails the
 * attempt, reconcile stamps TIMEOUT, the draft then re-quotes) and the wire
 * said none of it, so a dead create read `status: draft` forever with no
 * signal to stop polling or to resend. And the terms' own lapse — 600 s on
 * EVM — was two undescribed integers.
 *
 * Every figure below is read from the SAME constant the job or the relay runs
 * on, never retyped: a sentence that says "30 minutes" beside a job that gives
 * up at 20 is the drift these guards exist to refuse.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RELAY_QUOTE_TTL_SECONDS, SOLANA_BLOCKHASH_VALIDITY_SECONDS, X_PAYMENT_HEADER, apiRoutes } from '@tenda/shared'
import { EVM_POLL_INTERVAL_MS } from '@server/chains/evm/listener-polling/constants'
import { RECONCILE_GIVE_UP_MS, RECONCILE_INTERVAL_MS } from '@server/queue/jobs/reconcile-escrows'
import { AGENT_API_DOCUMENT, AGENT_API_POST, AGENT_API_STABILITY } from '@tenda/api-doc'
import { plainProse } from '@tenda/api-doc/testing'

const task = AGENT_API_DOCUMENT.paths[apiRoutes.agent.tasks]?.post
assert.ok(task !== undefined, 'the task operation is documented')

test('#146 (1): nothing in the document calls the post "one call" — it is two requests', () => {
  // #138 fixed the summary; the purpose line and the stability guarantee kept
  // the claim, and both documents opened with it.
  assert.doesNotMatch(AGENT_API_POST, /one call/i)
  assert.doesNotMatch(AGENT_API_DOCUMENT.info.description, /one call/i)
  for (const line of AGENT_API_STABILITY) assert.doesNotMatch(line, /ONE call/)
  assert.match(AGENT_API_POST, /two requests/)
  assert.ok(AGENT_API_STABILITY.some((line) => /ONE operation of TWO requests/.test(line)), 'the stability line says what "one" means')
})

test('#146 (3): the operation names the poll cadence and the give-up horizon, from the constants the jobs run on', () => {
  const text = task.description
  assert.match(text, new RegExp(`every ${EVM_POLL_INTERVAL_MS / 1000} s`), 'the cadence is the listener poll interval')
  assert.match(text, new RegExp(`within ${RECONCILE_GIVE_UP_MS / 60_000} minutes`), 'the horizon is the reconcile give-up')
  // The horizon alone overstated it: the timeout is stamped by a SWEEP, at the
  // first tick at or after the give-up age, so a resend exactly at the horizon
  // can still meet the in-flight 409. The document names the cadence and the
  // sum, both from the constants the schedule runs on.
  assert.match(text, new RegExp(`sweep that runs every ${RECONCILE_INTERVAL_MS / 60_000} minutes`), 'the sweep cadence is the schedule\'s')
  assert.match(text, new RegExp(`allow up to ${(RECONCILE_GIVE_UP_MS + RECONCILE_INTERVAL_MS) / 60_000}`), 'the worst case is horizon plus one tick')
  assert.match(text, /past it retry after the next sweep/)
  // A retyped figure would pass a looser check; these pin the derivation.
  assert.strictEqual(EVM_POLL_INTERVAL_MS % 1000, 0)
  assert.strictEqual(RECONCILE_GIVE_UP_MS % 60_000, 0)
  assert.strictEqual(RECONCILE_INTERVAL_MS % 60_000, 0)
})

test('#144 document half: the failure branch after the 201 is stated — fail, time out, resend fresh, 409 in flight', () => {
  // Read through `plainProse`. Every clause below is the SAME clause this
  // guard has always asserted; what changed is that the description is now
  // written as CommonMark, so the emphasis these phrases carried in capitals
  // is carried by `**` instead. The phrases stay whole — a fact dropped still
  // fails here — but whether a word is bold is not this test's business.
  const text = plainProse(task.description)
  assert.match(text, /can fail \(the chain rejects it\) or time out/)
  assert.match(text, /stays status: draft and becomes resendable/)
  assert.match(text, new RegExp(`same body without ${X_PAYMENT_HEADER} answers a fresh 402`))
  assert.match(text, /resend, not wait/)
  assert.match(text, /while the create is in flight is 409/)
  assert.match(text, /expires_at_unix/, 'it points at the terms\' own lapse')
})

test('#144: the two terms integers say what they are and what a late signature gets', () => {
  const terms = AGENT_API_DOCUMENT.components.schemas.RelayTerms.properties ?? {}
  const timeout = terms.max_timeout_seconds?.description ?? ''
  const expires = terms.expires_at_unix?.description ?? ''
  assert.match(timeout, new RegExp(`${RELAY_QUOTE_TTL_SECONDS} on EVM`))
  assert.match(timeout, new RegExp(`${SOLANA_BLOCKHASH_VALIDITY_SECONDS}, on Solana`))
  assert.match(timeout, /422 RELAY_REJECTED/)
  assert.match(timeout, /WITHOUT X-PAYMENT re-quotes fresh terms/)
  assert.match(expires, /issued-at plus max_timeout_seconds/)
})

test('#146 (2): the registry asset says whether it funds by signature, and what a false one gets', () => {
  const asset = AGENT_API_DOCUMENT.components.schemas.ChainRegistryAsset
  const field = asset.properties?.funds_by_signature
  assert.ok(field !== undefined, 'funds_by_signature is published on the registry asset')
  assert.ok(asset.required?.includes('funds_by_signature'), 'and it is required — no optional key on the wire')
  assert.match(field.description ?? '', /POST \/v1\/agent\/tasks/)
  assert.match(field.description ?? '', /422 RELAY_UNSUPPORTED_ASSET/)
  assert.match(field.description ?? '', /supports_permit is a different capability/)
})

