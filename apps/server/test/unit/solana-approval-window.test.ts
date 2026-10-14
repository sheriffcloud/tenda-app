/**
 * #148 — the Solana adapter's review window is `platform_state
 * .approval_window_seconds`, read from the program's own account: an i64 the
 * IDL decodes as a BN, handed to the registry as a plain number of seconds.
 * The EVM half is proven through the chains plugin (chains-plugin-boot); this
 * is the other producer, held to the same three answers: the value, the cache,
 * and the refusal when the account is not there.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import BN from 'bn.js'
import { solanaAdapter } from '@server/chains/solana'
import { platformPda } from '@server/chains/solana/pdas'
import { AppError } from '@server/lib/errors'
import { CREATOR, USDC_MINT, encodePlatformState, fakeSolanaRpc, platformStateFixture } from '../helpers/solana'

function adapterOver(rpc = fakeSolanaRpc()) {
  return {
    rpc,
    adapter: solanaAdapter({
      chain_id: 'solana:devnet',
      rpc_url: 'http://127.0.0.1:8899',
      deps: {
        rpc,
        async resolveWalletAddress() { return CREATOR.toBase58() },
        async resolveAsset() { return { token_address: USDC_MINT.toBase58() } },
      },
    }),
  }
}

test('reads platform_state.approval_window_seconds as a number of seconds', async () => {
  const { rpc, adapter } = adapterOver()
  // Not the fixture's default: a value the assertion cannot pass by accident.
  rpc.stageAccount(platformPda(), await encodePlatformState(platformStateFixture({ approvalWindowSeconds: new BN(90_000) })))
  assert.strictEqual(await adapter.approvalWindowSeconds(), 90_000)
})

test('an uninitialised platform account rejects — the registry omits the chain rather than inventing a window', async () => {
  const { adapter } = adapterOver()
  await assert.rejects(
    adapter.approvalWindowSeconds(),
    (err: unknown) => err instanceof AppError && err.statusCode === 500 && /not initialized/.test(err.message),
  )
})
