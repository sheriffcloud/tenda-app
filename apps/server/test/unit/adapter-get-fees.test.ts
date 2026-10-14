/**
 * `getFees()` on both producers: what the CONTRACT charges, read live. EVM reads
 * `feeBps()` / `seekerFeeBps()`; Solana decodes `platform_state`. Each must answer the
 * chain's own numbers (values the assertion cannot hit by accident), map them to the
 * port's `{ fee_bps, seeker_fee_bps }` spelling in the right order, and refuse rather
 * than invent when the chain cannot answer.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { evmAdapter, type EvmAdapterDeps } from '@server/chains/evm'
import type { EvmRpc } from '@server/chains/evm/rpc'
import { solanaAdapter } from '@server/chains/solana'
import { platformPda } from '@server/chains/solana/pdas'
import { createEvmRpc } from '@server/chains/evm/rpc'
import { AppError } from '@server/lib/errors'
import { startStubRpc } from '../helpers/stub-rpc'
import { encodeAbiParameters, toFunctionSelector } from 'viem'
import { CREATOR, USDC_MINT, encodePlatformState, fakeSolanaRpc, platformStateFixture } from '../helpers/solana'

const CONTRACT = '0x00000000000000000000000000000000000000e5' as const

function evmWith(rpc: Partial<EvmRpc>) {
  const deps: EvmAdapterDeps = {
    resolveWalletAddress: async () => CONTRACT,
    resolveAsset: async () => ({ token_address: CONTRACT }),
    rpc: {
      async readApprovalWindow() { return 172_800n },
      async readFees() { return { feeBps: 250, seekerFeeBps: 100 } },
      async getTransactionReceipt() { return null },
      async getBlockNumber() { return 1n },
      async getLogRefs() { return [] },
      async readEscrow() { return null },
      async readPermitFacts() { return { name: 'USDC', nonce: 0n, domain_separator: `0x${'00'.repeat(32)}` as const } },
      ...rpc,
    },
  }
  return evmAdapter({ chain_id: 'eip155:8453', rpc_url: 'http://unused.invalid', escrow_contract: CONTRACT, min_confirmations: 1, deps })
}

test('EVM: the contract\'s feeBps and seekerFeeBps, in the port\'s spelling and the right order', async () => {
  const seen: string[] = []
  const adapter = evmWith({ async readFees(contract) { seen.push(contract); return { feeBps: 337, seekerFeeBps: 41 } } })
  assert.deepStrictEqual(await adapter.getFees(), { fee_bps: 337, seeker_fee_bps: 41 })
  assert.deepStrictEqual(seen, [CONTRACT], 'it reads the adapter\'s CURRENT contract')
})

test('EVM: an unreadable contract rejects, so the check calls the chain UNKNOWN', async () => {
  const adapter = evmWith({ async readFees() { throw new Error('execution reverted') } })
  await assert.rejects(adapter.getFees(), /execution reverted/)
})

function solanaOver(rpc = fakeSolanaRpc()) {
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

test('Solana: platform_state.fee_bps and seeker_fee_bps, decoded from the program\'s own account', async () => {
  const { rpc, adapter } = solanaOver()
  rpc.stageAccount(platformPda(), await encodePlatformState(platformStateFixture({ feeBps: 333, seekerFeeBps: 77 })))
  assert.deepStrictEqual(await adapter.getFees(), { fee_bps: 333, seeker_fee_bps: 77 })
})

test('Solana: an uninitialised platform account rejects rather than inventing fees', async () => {
  const { adapter } = solanaOver()
  await assert.rejects(adapter.getFees(), (err: unknown) => err instanceof AppError && /not initialized/.test(err.message))
})

test('EVM, over the wire: feeBps() and seekerFeeBps() are two different calls, decoded as uint16 and not swapped', async () => {
  const FEE = toFunctionSelector('feeBps()')
  const SEEKER = toFunctionSelector('seekerFeeBps()')
  const answers: Record<string, bigint> = { [FEE]: 275n, [SEEKER]: 90n }
  const node = await startStubRpc((method, params) => {
    if (method === 'eth_chainId') return '0x1'
    if (method === 'eth_call') {
      const data = String((params[0] as { data: string }).data)
      const value = answers[data.slice(0, 10)]
      return value === undefined ? '0x' : encodeAbiParameters([{ type: 'uint16' }], [Number(value)])
    }
    return null
  })
  try {
    const rpc = createEvmRpc({ rpc_url: node.url })
    assert.deepStrictEqual(await rpc.readFees(CONTRACT), { feeBps: 275, seekerFeeBps: 90 })
    assert.deepStrictEqual(
      node.callsTo('eth_call').map((c) => String((c.params[0] as { data: string }).data).slice(0, 10)).sort(),
      [FEE, SEEKER].sort(),
      'exactly the two getters, nothing else',
    )
  } finally {
    await node.close()
  }
})
