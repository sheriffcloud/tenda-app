/**
 * A configured chain must be a `live` chain (#145).
 *
 * The manifest's `status` is what the landing announces; the `CHAIN_<id>_*`
 * env is what this process serves. Nothing else made the two agree: an
 * operator who set env for a `planned` chain got it SERVED as settleable
 * while the site said it was coming, and a chain deployed and configured
 * while the manifest still said `launching` kept announcing a launch. The
 * loader now refuses both at boot, naming the chain, its status and the env
 * prefix — the fix is to flip the manifest in the same release as the env.
 *
 * Both directions: the refusal for the two non-live statuses, and the
 * absence of one for a live chain and for a planned chain nobody configured.
 * The `launching` case uses a fixture manifest, because the real manifest
 * holds no launching entry today and a test that needed one would either
 * wait for a launch or measure nothing.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { CHAIN_MANIFEST, chainById, type ChainManifestEntry } from '@tenda/shared'
import { chainEnvPrefix, loadChainSecrets } from '@server/chains/secrets'

const EVM_ADDR = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const RPC = 'https://rpc.example/v2/key'

/** The minimal env that fully configures one EVM chain. */
function evmEnv(chainId: string): NodeJS.ProcessEnv {
  const prefix = chainEnvPrefix(chainId)
  return {
    [`${prefix}_RPC_URL`]: RPC,
    [`${prefix}_ESCROW_ADDR`]: EVM_ADDR,
    [`${prefix}_TREASURY_ADDR`]: EVM_ADDR,
  }
}

/** Real manifest entries by status, so the cases mean something about the real vocabulary. */
const planned = CHAIN_MANIFEST.find((c) => c.namespace === 'eip155' && c.status === 'planned')
const live = CHAIN_MANIFEST.find((c) => c.namespace === 'eip155' && c.status === 'live')
assert.ok(planned !== undefined, 'the manifest needs a planned EVM chain for these to mean anything')
assert.ok(live !== undefined, 'the manifest needs a live EVM chain for these to mean anything')

test('a configured chain the manifest calls planned is a boot error naming the chain, the status and the prefix', () => {
  assert.throws(
    () => loadChainSecrets(evmEnv(planned.id)),
    (err: Error) => {
      assert.match(err.message, new RegExp(`${planned.id}: configured \\(${chainEnvPrefix(planned.id)}_\\*\\)`))
      assert.match(err.message, /status 'planned'/)
      assert.match(err.message, /only a 'live' chain may be served/)
      return true
    },
  )
})

test('a configured chain the manifest calls launching is refused the same way', () => {
  // The likelier drift: deployed and configured, manifest not yet flipped.
  const launching: ChainManifestEntry = { ...chainById(live.id), status: 'launching' }
  const manifest = CHAIN_MANIFEST.map((c) => (c.id === live.id ? launching : c))
  assert.throws(() => loadChainSecrets(evmEnv(live.id), manifest), /status 'launching'/)
})

test('the status refusal is reported ALONGSIDE a field error, not instead of it', () => {
  // The loader aggregates so a misconfigured deployment sees every problem
  // on one restart; the new rule must not short-circuit that.
  const env = { ...evmEnv(planned.id), [`${chainEnvPrefix(planned.id)}_RPC_URL`]: 'not a url' }
  assert.throws(
    () => loadChainSecrets(env),
    (err: Error) => {
      assert.match(err.message, /status 'planned'/)
      assert.match(err.message, /malformed value/)
      return true
    },
  )
})

test('a refused chain does not hold its family slot — a live sibling is not reported as a clash', () => {
  // The refusal `continue`s before the one-per-family check. Without that,
  // Base mainnet (planned) beside Base Sepolia (live) would ALSO report
  // "share family 'base'" — a second error naming a problem the operator
  // does not have, on top of the one they do.
  const sibling = CHAIN_MANIFEST.find(
    (c) => c.namespace === 'eip155' && c.status === 'live' && c.family === planned.family,
  )
  assert.ok(sibling !== undefined, 'the planned chain needs a live sibling in its family for this to mean anything')
  assert.throws(
    () => loadChainSecrets({ ...evmEnv(planned.id), ...evmEnv(sibling.id) }),
    (err: Error) => {
      assert.match(err.message, /status 'planned'/)
      assert.doesNotMatch(err.message, /share family/)
      return true
    },
  )
})

test('a live chain with the same env is served — the rule only makes manifest and env agree', () => {
  const secrets = loadChainSecrets(evmEnv(live.id))
  assert.strictEqual(secrets.size, 1)
  assert.ok(secrets.has(live.id))
})

test('a planned chain nobody configured is silent, exactly as before', () => {
  // Availability still comes from env: an unconfigured planned chain is the
  // normal state of the manifest, not an error.
  assert.strictEqual(loadChainSecrets({}).size, 0)
})
