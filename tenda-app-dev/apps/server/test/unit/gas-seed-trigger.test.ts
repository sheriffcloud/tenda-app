/**
 * `fireRetroactiveGasSeed` — the fire-and-forget contract, at the ONE place it
 * can be broken without any test noticing.
 *
 * The trigger runs on a successful wallet link and after phone verification,
 * AFTER the row it belongs to has already been written. So anything it throws
 * synchronously turns a link that succeeded into a 500 — a failure
 * `test/integration/auth-link-wallet.test.ts` measures the route against, but
 * cannot provoke, because the harness configures no seed key and the throw
 * lives in sender CONSTRUCTION.
 *
 * That construction really can throw: Solana's `GAS_SEED_KEY` is declared
 * `kind: 'str'` in SECRET_SCHEMA, so any non-empty value passes boot and only
 * `Keypair.fromSecretKey` finds out. Rotating that key to a malformed value is
 * enough — the deployment boots, and the next wallet link 500s.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@tenda/shared/db/schema'
import { fireRetroactiveGasSeed, type GasSeedHost } from '@server/features/gas-seed'
import { resetChainSecretsCache } from '@server/chains/secrets'

/**
 * A real drizzle handle over a client pointed at nothing. `postgres()` is lazy,
 * so building it costs nothing; a query against it fails, which is exactly what
 * the second case below wants. A real handle rather than a cast keeps the
 * `unknown`-cast ban intact.
 */
function idleDb(): GasSeedHost['db'] {
  return drizzle(postgres('postgres://unused:unused@127.0.0.1:1/unused', { max: 1 }), { schema })
}

interface Warning {
  obj: Record<string, unknown>
  msg: string
}

/**
 * How long a warning may take before the contract is considered broken.
 *
 * A deadline, not a settling window: a healthy run resolves in a millisecond
 * or two, and this only ever fires when the trigger swallowed the failure
 * instead of logging it. Without it that regression makes the suite HANG
 * rather than fail — the shape #48 exists to keep out of this gate.
 */
const WARNING_DEADLINE_MS = 5_000

/** The first warning, or a failure that says the trigger logged nothing. */
function firstWarning(warned: Promise<Warning>): Promise<Warning> {
  return Promise.race([
    warned,
    new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no warning logged within ${WARNING_DEADLINE_MS}ms — the failure was swallowed`)),
        WARNING_DEADLINE_MS,
      )
      // Never hold the process open on the deadline itself.
      timer.unref()
    }),
  ])
}

interface Logged {
  host: GasSeedHost
  /** Resolves with the FIRST warning — no timer, so nothing here races. */
  warned: Promise<Warning>
  warnings: Warning[]
}

function hostWithLog(): Logged {
  const warnings: Warning[] = []
  let first: (w: Warning) => void = () => {}
  const warned = new Promise<Warning>((resolve) => { first = resolve })
  return {
    warnings,
    warned,
    host: {
      db: idleDb(),
      log: {
        info() {},
        warn: (obj, msg) => {
          // The port types this `object`; the log writes a plain record, and
          // naming that here is what lets the assertions read `err` without a
          // cast.
          const w: Warning = { obj: { ...obj }, msg }
          warnings.push(w)
          first(w)
        },
      },
    },
  }
}

/** Run `body` with `env` applied on top of process.env, then restore both. */
async function withChainEnv(env: NodeJS.ProcessEnv, body: () => Promise<void>): Promise<void> {
  const saved = new Map(Object.keys(env).map((k) => [k, process.env[k]]))
  Object.assign(process.env, env)
  resetChainSecretsCache()
  try {
    await body()
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    resetChainSecretsCache()
  }
}

const SOLANA_ENV = {
  CHAIN_SOLANA_DEVNET_RPC_URL: 'https://api.devnet.solana.com',
  CHAIN_SOLANA_DEVNET_TREASURY_ADDR: '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes',
}

test('a hot-wallet secret that only fails at CONSTRUCTION cannot break the caller', async () => {
  // 'not-a-real-key' satisfies the schema's `str` kind, so the loader accepts it
  // and `solanaGasSeedSender` is the first thing to object.
  await withChainEnv({ ...SOLANA_ENV, CHAIN_SOLANA_DEVNET_GAS_SEED_KEY: 'not-a-real-key' }, async () => {
    const { host, warned } = hostWithLog()

    // The assertion is the absence of a synchronous throw: the caller has
    // already written the wallet row and is about to return 200.
    assert.doesNotThrow(() => fireRetroactiveGasSeed(host, 'user-1'))

    // …and the failure is not swallowed silently — it lands in the log the
    // fire-and-forget contract promises. Awaited via the log itself, so there
    // is no window to guess at.
    const w = await firstWarning(warned)
    assert.strictEqual(w.msg, 'retroactive gas seed failed')
    assert.deepStrictEqual(Object.keys(w.obj).sort(), ['err', 'user_id'])
    assert.match(String(w.obj.err), /base58/i)
  })
})

test('a database it cannot reach is contained the same way', async () => {
  // The OTHER end of the same contract, and the reason this file does not
  // assert "no key configured ⇒ nothing happens": with no key the trigger is
  // not a no-op at all — dispatch still asks the database which chains are
  // seedable. Here that query cannot succeed (the handle points nowhere), and
  // what matters is that the caller never learns: no throw, one warning.
  await withChainEnv(SOLANA_ENV, async () => {
    const { host, warned, warnings } = hostWithLog()
    assert.doesNotThrow(() => fireRetroactiveGasSeed(host, 'user-1'))
    const w = await firstWarning(warned)
    assert.strictEqual(w.msg, 'retroactive gas seed failed')
    assert.strictEqual(warnings.length, 1, 'one failure, reported once')
  })
})
