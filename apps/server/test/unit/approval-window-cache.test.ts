/**
 * #148 — the review window's read-through cache: the contract is read once
 * per TTL, an admin change lands after the TTL, a failed refresh answers the
 * last good value, and a read that never succeeded still throws — the signal
 * the registry route turns into "chain omitted, error logged".
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { APPROVAL_WINDOW_TTL_MS, cachedApprovalWindow } from '@server/chains/shared/approval-window'

function clock(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

test('reads the contract once per TTL and follows a change after it', async () => {
  const c = clock()
  const answers = [86_400, 172_800]
  let reads = 0
  const window = cachedApprovalWindow(async () => { reads += 1; return answers[Math.min(reads - 1, 1)] ?? 0 }, c.now)
  assert.strictEqual(await window(), 86_400)
  assert.strictEqual(await window(), 86_400)
  assert.strictEqual(reads, 1, 'served from cache inside the TTL')
  c.advance(APPROVAL_WINDOW_TTL_MS - 1)
  assert.strictEqual(await window(), 86_400)
  assert.strictEqual(reads, 1)
  c.advance(1)
  // The multisig changed the window on-chain: the next read after the TTL sees it.
  assert.strictEqual(await window(), 172_800)
  assert.strictEqual(reads, 2)
})

test('a refresh that fails answers the last good value — one RPC hiccup must not 500 the registry', async () => {
  const c = clock()
  let fail = false
  const window = cachedApprovalWindow(async () => { if (fail) throw new Error('rpc down'); return 86_400 }, c.now)
  assert.strictEqual(await window(), 86_400)
  c.advance(APPROVAL_WINDOW_TTL_MS)
  fail = true
  assert.strictEqual(await window(), 86_400)
})

test('a read that has never succeeded throws — the route must omit the chain, never invent a window', async () => {
  const window = cachedApprovalWindow(async () => { throw new Error('platform state account not initialized') })
  await assert.rejects(window(), /not initialized/)
  // And it keeps trying rather than caching the failure.
  let calls = 0
  const flaky = cachedApprovalWindow(async () => { calls += 1; if (calls === 1) throw new Error('once'); return 3_600 })
  await assert.rejects(flaky(), /once/)
  assert.strictEqual(await flaky(), 3_600)
})
