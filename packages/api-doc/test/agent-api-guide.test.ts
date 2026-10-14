/**
 * The integration guide is IN the served document (#157 stage 3).
 *
 * The point of putting the walkthrough in `info.description` is that the JSON
 * an agent fetches and the page a docs site builds carry the same words. Two
 * ways that quietly stops being true, neither caught by anything else:
 *
 *   1. the interpolation is dropped — the document still validates, still
 *      drifts against nothing, and the guide simply is not there;
 *   2. a header, scheme or version is TYPED into the prose instead of read
 *      from the constant the API uses, so the guide keeps telling a reader to
 *      send a header the server stopped accepting.
 *
 * The paths it names are already held to the document by "every path named in
 * prose is one the document defines", and its chain/asset abstinence by "no
 * description hand-writes a chain or asset id" — both of which walk
 * `info.description` too. This file covers what those two cannot see.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  ErrorCode,
  TENDA_RELAY_SCHEME,
  X402_VERSION,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  apiRoutes,
} from '@tenda/shared'
import {
  AGENT_API_DOCUMENT,
  GUIDE_PATHS,
  integrationGuide,
} from '../src'

const description = AGENT_API_DOCUMENT.info.description

test('the served document carries the guide, not just a purpose line', () => {
  assert.ok(description.includes(integrationGuide()), 'info.description does not contain the guide')
  // And the purpose line survives ahead of it: the guide is an addition, not a
  // replacement for what the document already said about itself.
  assert.match(description, /^The gig surface of Tenda for agents/)
})

test('every step is there, in order', () => {
  const steps = [...description.matchAll(/\*\*(\d) — /g)].map((match) => match[1])
  assert.deepStrictEqual(steps, ['1', '2', '3', '4', '5'], 'a step was dropped or reordered')
})

test('the payment headers it names are the ones the API uses', () => {
  // Read from the constants, never typed: a guide naming `x-payment-header`
  // reads as authoritative and would be refused by the route.
  assert.ok(description.includes(`\`${X_PAYMENT_HEADER}\``), `the guide never names ${X_PAYMENT_HEADER}`)
  assert.ok(
    description.includes(`\`${X_PAYMENT_RESPONSE_HEADER}\``),
    `the guide never names ${X_PAYMENT_RESPONSE_HEADER}`,
  )
})

test('the x402 scheme and version it quotes are the ones the 402 sends', () => {
  assert.ok(description.includes(`\`${TENDA_RELAY_SCHEME}\``), 'the guide never names the relay scheme')
  assert.ok(description.includes(`version ${X402_VERSION}`), 'the guide never states the x402 version')
})

test('every path the guide walks through is one the document defines', () => {
  // The document-wide prose scan catches a path named ANYWHERE; this one is
  // narrower and answers a different question — that the guide's own itinerary
  // is complete and defined, so a step cannot point at nothing.
  assert.ok(GUIDE_PATHS.length >= 4, 'the itinerary is too short to be the guide')
  const defined = Object.keys(AGENT_API_DOCUMENT.paths)
  const dangling = GUIDE_PATHS.filter((path) => !defined.includes(path))
  assert.deepStrictEqual(dangling, [], 'the guide walks a reader to a path this document does not define')
  const unnamed = GUIDE_PATHS.filter((path) => !description.includes(path))
  assert.deepStrictEqual(unnamed, [], 'a path is listed in the itinerary but never appears in the guide')
})

test('the executable agent flow precedes catalogue reads for prefix-limited readers', () => {
  assert.deepStrictEqual(Object.keys(AGENT_API_DOCUMENT.paths).slice(0, 3), [
    apiRoutes.agent.demoSession,
    apiRoutes.agent.tasks,
    apiRoutes.agent.register,
  ])
  const serialized = JSON.stringify(AGENT_API_DOCUMENT)
  const taskExample = serialized.indexOf('"example":{"creation_operation_id"')
  const components = serialized.indexOf('"components"')
  assert.ok(taskExample >= 0, 'the task request example is absent')
  assert.ok(taskExample < components, 'the task example fell behind the component catalogue')
})

test('the document resolves operations to the origin it was fetched from, not a pinned deployment', () => {
  assert.deepStrictEqual(AGENT_API_DOCUMENT.servers, [
    { url: '/', description: 'The origin this document was fetched from' },
  ])
  assert.ok(!description.includes('https://'), 'the guide hard-codes an origin, so a second deployment would send readers to the first')
})

test('the guide tells a reader what a throttled request looks like, by the code the server sends', () => {
  const guide = integrationGuide()
  assert.ok(guide.includes('**429**'), 'the guide never mentions a 429')
  assert.ok(guide.includes(ErrorCode.RATE_LIMITED), 'the guide does not name the code a 429 carries')
  assert.ok(guide.includes('retry_after'), 'the guide does not say where the wait is stated')
})
