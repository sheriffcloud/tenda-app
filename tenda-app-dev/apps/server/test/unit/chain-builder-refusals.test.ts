/**
 * Chain-builder refusals that no test executed (#105 T7, the sweep's leftovers).
 *
 * Three seam-level guards from the Solana builders and the EVM permit
 * assembler. Each is a DEPLOYMENT-INTEGRITY check rather than input validation:
 * they fire when the code, the on-chain program and the asset registry disagree
 * with each other, which is the failure mode that is silent if it is not loud.
 *
 * Why a new file rather than extending the existing adapter suites: those are
 * 1022 and 1121 lines, already far past the 300-line rule, and adding to them
 * would deepen an exclusion rather than work inside it. The small factories
 * below mirror their `makeAdapter` helpers on purpose — the guards under test
 * fire EARLY, so the deps each needs are a fraction of what a full adapter
 * exercise requires, and copying the whole harness to reuse a name would be the
 * worse trade.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { AppError } from '@server/lib/errors'
import { solanaAdapter } from '@server/chains/solana'
import { fetchPlatformState } from '@server/chains/solana/builder-internals'
import { PROGRAM_ID, platformPda } from '@server/chains/solana/pdas'
import { evmAdapter } from '@server/chains/evm'
import type { EvmRpc } from '@server/chains/evm/rpc/types'
import {
  CREATOR,
  TREASURY,
  TEST_PROGRAM,
  USDC_MINT,
  encodePlatformState,
  fakeSolanaRpc,
  platformStateFixture,
} from '../helpers/solana'

const SOLANA_CHAIN = 'solana:devnet'
const EVM_CHAIN = 'eip155:8453'
const EVM_CONTRACT = '0x00000000000000000000000000000000000000e5' as const
const EVM_OWNER = '0x1111111111111111111111111111111111111111'

/** A real, valid Solana program id that is NOT the one compiled in. */
const FOREIGN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

/** An EvmRpc whose every method is a tripwire — see the permit case below. */
function unreachableEvmRpc(): EvmRpc {
  const never = (name: string) => (): never => {
    throw new Error(`unreachable: ${name} called, the guard under test should have refused first`)
  }
  return {
    getTransactionReceipt: never('getTransactionReceipt'),
    getBlockNumber: never('getBlockNumber'),
    getLogRefs: never('getLogRefs'),
    readEscrow: never('readEscrow'),
    readPermitFacts: never('readPermitFacts'),
  }
}

function makeSolanaAdapter(rpc = fakeSolanaRpc()) {
  return solanaAdapter({
    chain_id: SOLANA_CHAIN,
    rpc_url: 'http://127.0.0.1:8899',
    deps: {
      rpc,
      async resolveWalletAddress() {
        return CREATOR.toBase58()
      },
      async resolveAsset(asset: string) {
        return asset === 'SOL' ? { token_address: null } : { token_address: USDC_MINT.toBase58() }
      },
    },
  })
}

// ---------- solana/builders.ts: the program-pinning guard ---------------------------

test('solana buildTx: a contract other than the compiled-in program is 409', async () => {
  // #89 pins a contract address per escrow, so this field carries the program an
  // escrow was created under. Every instruction and PDA below derives from the
  // COMPILED-IN id, so an escrow held by a different program cannot be served —
  // and serving it silently would build a transaction against the wrong vault.
  // Solana upgrades in place and keeps its id, so this should never fire; that
  // is precisely why it must be loud if the policy is ever broken.
  const a = makeSolanaAdapter()

  await assert.rejects(
    a.buildTx({
      action: 'createEscrow',
      user_id: 'u1',
      contract: FOREIGN_PROGRAM,
      payload: {
        escrow_id: '11111111-2222-4333-8444-555555555555',
        kind: 'gig',
        asset: 'SOL',
        amount_raw: '1000000000',
        accept_deadline_unix: 1_900_000_000,
        completion_duration_seconds: 7_200,
        dispute_bond_raw: '100000000',
        is_seeker: false,
        requires_approval: false,
        unassign_window_seconds: 0,
      },
    }),
    (err: AppError) =>
      err.statusCode === 409 &&
      err.code === 'ESCROW_MISMATCH' &&
      err.message.includes(FOREIGN_PROGRAM) &&
      err.message.includes(PROGRAM_ID.toBase58()),
  )
})

test('solana buildTx: the compiled-in program id, and no contract at all, both pass', async () => {
  // The control on both arms of `args.contract !== undefined && args.contract
  // !== PROGRAM_ID` — either half alone would refuse legitimate traffic, and an
  // inverted guard would refuse everything.
  const a = makeSolanaAdapter()
  const payload = {
    escrow_id: '11111111-2222-4333-8444-555555555555',
    kind: 'gig' as const,
    asset: 'SOL',
    amount_raw: '1000000000',
    accept_deadline_unix: 1_900_000_000,
    completion_duration_seconds: 7_200,
    dispute_bond_raw: '100000000',
    is_seeker: false,
    requires_approval: false,
    unassign_window_seconds: 0,
  }

  // `UnsignedTx` is a union across chain families, so the kind is narrowed
  // rather than cast — and asserting it is itself worth something: a Solana
  // build that returned an evm-tx would be a wiring bug this catches.
  const pinned = await a.buildTx({
    action: 'createEscrow', user_id: 'u1', contract: PROGRAM_ID.toBase58(), payload,
  })
  assert.strictEqual(pinned.kind, 'solana-tx')
  assert.ok(pinned.tx_base64.length > 0, 'an escrow pinned to THIS program builds')

  const unpinned = await a.buildTx({ action: 'createEscrow', user_id: 'u1', payload })
  assert.strictEqual(unpinned.kind, 'solana-tx')
  assert.ok(unpinned.tx_base64.length > 0, 'an escrow with no pin builds')
})

// ---------- solana/builder-internals.ts: platform state ------------------------------

test('fetchPlatformState: an uninitialised platform account is a 500 naming the PDA', async () => {
  // The platform PDA holds the fee and window parameters every build reads. If
  // it is missing, the deployment is not initialised — a 500 is right, and the
  // ADDRESS in the message is what an operator needs to check.
  const rpc = fakeSolanaRpc()
  const addr = platformPda().toBase58()
  const deps = {
    rpc,
    program: TEST_PROGRAM,
    async resolveWalletAddress() {
      return CREATOR.toBase58()
    },
    async resolveAsset() {
      return { token_address: null }
    },
  }

  await assert.rejects(
    fetchPlatformState(deps),
    (err: AppError) =>
      err.statusCode === 500 &&
      err.code === 'INTERNAL_ERROR' &&
      err.message.includes(addr) &&
      /not initialized/.test(err.message),
  )

  // The control, on the SAME deps — staging the account is the only thing that
  // changes. Without it the refusal above is satisfiable by a fetch that throws
  // for any reason at all, including one that can never read the PDA.
  rpc.stageAccount(platformPda(), await encodePlatformState(platformStateFixture()))
  const state = await fetchPlatformState(deps)
  assert.strictEqual(state.treasury.toBase58(), TREASURY.toBase58())
})

// ---------- evm/permit-payload.ts: registry vs manifest -------------------------------

test('buildPermitPayload: an asset the registry reports as native is 422', async () => {
  // The disagreement this catches: the MANIFEST says the asset supports
  // EIP-2612 (so the guard above this one passes) while the asset REGISTRY
  // returns no token address, i.e. native. There is no ERC-20 to permit, and
  // continuing would hand `null` to a contract read. The message tells the
  // client to use the approve flow, which is the only thing it can do.
  //
  // Reached by overriding `resolveAsset` alone — everything else is the working
  // configuration, which is what makes this about the guard and not the setup.
  //
  // WHAT THIS TEST ADDS OVER THE COMPILER, since the two prove different halves.
  // MEASURED: neutering the guard (`token_address === null && false`) does not
  // compile — the read below it needs `token_address` narrowed to `string`, so
  // TypeScript already guarantees the check EXISTS. What it cannot guarantee is
  // the ANSWER: swap the 422 for a 500, or the message for something that does
  // not name the approve flow, and the build stays green while the client loses
  // its only instruction. That contract is what this case pins.
  const adapter = evmAdapter({
    chain_id: EVM_CHAIN,
    rpc_url: 'http://unused.invalid',
    escrow_contract: EVM_CONTRACT,
    min_confirmations: 5,
    deps: {
      async resolveWalletAddress() {
        return EVM_OWNER
      },
      async resolveAsset() {
        return { token_address: null }
      },
      async verifyWalletOwnership(user_id, address) {
        return user_id === 'u1' && address === EVM_OWNER
      },
      // Every method throws on purpose: the guard under test refuses BEFORE any
      // RPC read, so a call here would mean the test reached further than it
      // claims to and would fail loudly rather than silently pass.
      rpc: unreachableEvmRpc(),
    },
  })

  assert.ok(adapter.buildPermitPayload, 'the EVM adapter exposes permit assembly')
  await assert.rejects(
    adapter.buildPermitPayload({
      user_id: 'u1',
      owner: EVM_OWNER,
      asset: 'USDC_BASE',
      value_raw: '1000000',
    }),
    (err: AppError) =>
      err.statusCode === 422 &&
      err.code === 'PERMIT_UNAVAILABLE' &&
      /is native on/.test(err.message) &&
      err.message.includes(EVM_CHAIN),
  )
})

/**
 * NOT COVERED, recorded rather than forced — T7's other two:
 *
 *   chains/solana/instructions/settle.ts:108  'unhandled settle action'. It sits
 *   AFTER a switch that returns from every arm of a two-member union, and the
 *   comment above it says so: it exists to satisfy control-flow analysis.
 *   Reaching it needs a third action the type does not permit, i.e. a cast at
 *   the call site — testing the cast, not the product.
 *
 *   lib/escrow-routes.ts:159  `assertEscrowStatus`'s default, 'schema drift'.
 *   The function is module-private and its only input is the `escrows.status`
 *   column, whose pg enum and the `EscrowStatus` union are 1:1 by design. It
 *   takes a plain `string` — so it WOULD be trivially testable if exported —
 *   but reaching it as the code stands means putting a value in the column that
 *   the enum forbids, which needs a migration rather than a test. It is the
 *   deliberate tripwire for exactly that drift, and the docblock above it says
 *   as much; deleting it would trade a loud 500 for a silent mis-narrow.
 */
