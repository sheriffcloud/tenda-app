/**
 * Boot the REAL chains plugin against the REAL database.
 *
 * The HTTP harness (`helpers/test-app`) makes exactly one substitution: a FAKE
 * chain registry, so no route suite depends on RPC. The cost of that is that
 * `plugins/chains.ts` runs in no route test at all — anything asking what the
 * PLUGIN does has to build its own app. Two suites now do (the #89 boot suite
 * and the #112 resolver suite), so the two pieces they share live here instead
 * of in whichever file happened to write them first.
 *
 * `withEvmChainEnv` (helpers/stub-rpc) is the third piece and stays where it is:
 * it is about the secrets environment, not about booting.
 */
import './test-app/env'
import Fastify, { type FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { chains as chainsTable } from '@tenda/shared/db/schema'
import { resetChainSecretsCache } from '@server/chains/secrets'
import dbPlugin from '@server/plugins/db'
import chainsPlugin from '@server/plugins/chains'
import { seedAltChain, TEST_CHAIN_ID_ALT } from './test-app'

/**
 * A bare app carrying the real db + chains plugins, always closed.
 *
 * It registers both and leaves `ready()` to the caller. A suite asserting on a
 * REFUSED boot cannot use this: `await register()` already drives the plugin's
 * load, so the throw surfaces inside here rather than inside the caller's
 * `assert.rejects`. Such a suite builds its own app — see the third case in
 * `chains-plugin-boot.test.ts`, which says the same thing from the other side.
 */
export async function withBootedChainsApp(
  body: (app: FastifyInstance) => Promise<void>,
): Promise<void> {
  const app = Fastify({ logger: false })
  try {
    await app.register(dbPlugin)
    await app.register(chainsPlugin)
    await body(app)
  } finally {
    await app.close()
  }
}

/**
 * The EVM chain row naming the contract the environment configures, so the
 * plugin's registry-sync boot gate passes.
 *
 * Through `seedAltChain` because that helper owns the chain AND its asset row;
 * hand-inserting only the chain leaves `escrows_asset_chain_fk` unsatisfiable
 * for any escrow on it.
 */
export async function seedBootChain(
  app: FastifyInstance,
  args: { escrow: string; treasury: string },
): Promise<void> {
  await seedAltChain(app)
  await app.db
    .update(chainsTable)
    .set({ treasury_address: args.treasury, escrow_program: args.escrow })
    .where(eq(chainsTable.id, TEST_CHAIN_ID_ALT))
}

/**
 * Run `body` with NO chain configured at all, then restore the environment.
 *
 * The mirror of `withEvmChainEnv`: that one points the loader at exactly one
 * chain, this one points it at none, which is the state the plugin's
 * "no chains configured" boot refusal exists for. Restoring matters as much as
 * clearing — `getChainSecrets()` caches and the loader reads process.env, so a
 * leaked CHAIN_* (or a leaked absence) changes what every later file in this
 * worker sees.
 */
export async function withNoChainsConfigured(body: () => Promise<void>): Promise<void> {
  const saved = { ...process.env }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('CHAIN_')) delete process.env[key]
  }
  resetChainSecretsCache()
  try {
    await body()
  } finally {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CHAIN_')) delete process.env[key]
    }
    Object.assign(process.env, saved)
    resetChainSecretsCache()
  }
}
