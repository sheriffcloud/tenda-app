/**
 * Advisory boot check: once the app is ready, compare every configured chain's
 * fees to `platform_config` and log loudly on a disagreement (see
 * features/platform-fees/boot-check for the rules).
 *
 * `onReady` runs after the chain registry exists, and the check is deliberately NOT
 * awaited: it reads every chain over RPC, and server start must never depend on a
 * node being up. It never writes and never throws.
 */
import fp from 'fastify-plugin'
import { checkPlatformFees } from '@server/features/platform-fees/boot-check'

export default fp(async (fastify) => {
  fastify.addHook('onReady', async () => {
    void checkPlatformFees({ db: fastify.db, adapters: fastify.chains.list(), log: fastify.log })
  })
}, { name: 'platform-fee-check' })
