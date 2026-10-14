/**
 * The plugin wiring: the check runs when the app is ready, logs a mismatch, and NEVER
 * delays or fails boot, however slow or broken a chain is. A bare Fastify instance
 * shares the harness's database; its chain registry is supplied per test.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { Writable } from 'node:stream'
import Fastify from 'fastify'
import platformFeeCheck from '@server/plugins/platform-fee-check'
import type { ChainAdapter } from '@server/chains/types'
import { TEST_CHAIN_ID, fakeRegistry } from '../helpers/test-app/fake-chain'
import { TEST_DB_CONFIGURED, resetDb, setPlatformConfig, useTestApp } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** The harness's Solana fake with its fee read replaced: everything else about the chain stays real-shaped. */
const withFees = (getFees: ChainAdapter['getFees']): ChainAdapter => ({ ...fakeRegistry().get(TEST_CHAIN_ID), getFees })
const fees = (fee_bps: number, seeker_fee_bps: number) => withFees(async () => ({ fee_bps, seeker_fee_bps }))

async function bootWith(adapter: ChainAdapter) {
  const lines: Array<{ level: number; msg: string }> = []
  const stream = new Writable({ write(chunk, _enc, done) { lines.push(JSON.parse(String(chunk))); done() } })
  const app = Fastify({ logger: { level: 'info', stream } })
  app.decorate('db', getApp().db)
  app.decorate('chains', fakeRegistry({ chain_id: TEST_CHAIN_ID, adapter }))
  await app.register(platformFeeCheck)
  const started = Date.now()
  await app.ready()
  return { app, lines, readyMs: Date.now() - started }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 150))
const ERROR = 50

test('a contract that disagrees with platform_config is logged as an error once the app is ready', { skip }, async () => {
  await resetDb(getApp())
  await setPlatformConfig(getApp(), { fee_bps: 300, seeker_fee_bps: 120 })
  const { app, lines } = await bootWith(fees(250, 100))
  await settle()
  await app.close()
  const errors = lines.filter((l) => l.level === ERROR)
  assert.strictEqual(errors.length, 1)
  assert.match(errors[0].msg, /platform fee mismatch/)
})

test('agreement is silent at error level', { skip }, async () => {
  await resetDb(getApp())
  await setPlatformConfig(getApp(), { fee_bps: 250, seeker_fee_bps: 100 })
  const { app, lines } = await bootWith(fees(250, 100))
  await settle()
  await app.close()
  assert.strictEqual(lines.filter((l) => l.level >= ERROR).length, 0)
})

test('a chain that NEVER answers does not delay boot: ready resolves without waiting for the check', { skip }, async () => {
  await resetDb(getApp())
  const { app, readyMs } = await bootWith(withFees(() => new Promise<never>(() => {})))
  await app.close()
  assert.ok(readyMs < 2_000, `boot waited ${readyMs}ms on a chain that never answers`)
})

test('a chain that throws does not fail boot', { skip }, async () => {
  await resetDb(getApp())
  const { app, lines } = await bootWith(withFees(async () => { throw new Error('rpc exploded') }))
  await settle()
  await app.close()
  assert.strictEqual(lines.filter((l) => l.level >= ERROR).length, 0, 'an unreadable chain is a warning, not an error')
})
