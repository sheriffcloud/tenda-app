import { test } from 'node:test'
import * as assert from 'node:assert'
import { loadChainSecrets } from '@server/chains/secrets'

const SOL = '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes'
const EVM = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

function solanaEnv(): NodeJS.ProcessEnv {
  return {
    CHAIN_SOLANA_DEVNET_RPC_URL: 'https://primary.example',
    CHAIN_SOLANA_DEVNET_TREASURY_ADDR: SOL,
  }
}

function evmEnv(): NodeJS.ProcessEnv {
  return {
    CHAIN_EIP155_8453_RPC_URL: 'https://primary.example',
    CHAIN_EIP155_8453_ESCROW_ADDR: EVM,
    CHAIN_EIP155_8453_TREASURY_ADDR: EVM,
  }
}

test('EVM reads an optional secondary RPC URL', () => {
  const base = loadChainSecrets({
    ...evmEnv(),
    CHAIN_EIP155_8453_RPC_URL_FALLBACK: 'https://fallback.example',
  }).get('eip155:8453')
  assert.ok(base && base.namespace === 'eip155')
  assert.equal(base.rpcUrlFallback, 'https://fallback.example')
})

test('an absent EVM fallback remains undefined', () => {
  const base = loadChainSecrets(evmEnv()).get('eip155:8453')
  assert.ok(base && base.namespace === 'eip155')
  assert.equal(base.rpcUrlFallback, undefined)
})

test('Solana reads an optional secondary RPC URL', () => {
  const solana = loadChainSecrets({
    ...solanaEnv(),
    CHAIN_SOLANA_DEVNET_RPC_URL_FALLBACK: 'https://fallback.example',
  }).get('solana:devnet')
  assert.ok(solana && solana.namespace === 'solana')
  assert.equal(solana.rpcUrlFallback, 'https://fallback.example')
})

test('an absent Solana fallback remains undefined', () => {
  const solana = loadChainSecrets(solanaEnv()).get('solana:devnet')
  assert.ok(solana && solana.namespace === 'solana')
  assert.equal(solana.rpcUrlFallback, undefined)
})

test('a malformed EVM fallback is a named boot error', () => {
  assert.throws(
    () => loadChainSecrets({ ...evmEnv(), CHAIN_EIP155_8453_RPC_URL_FALLBACK: 'not a url' }),
    /malformed value\(s\) for CHAIN_EIP155_8453_RPC_URL_FALLBACK/,
  )
})

test('a malformed Solana fallback is a named boot error', () => {
  assert.throws(
    () => loadChainSecrets({
      ...solanaEnv(),
      CHAIN_SOLANA_DEVNET_RPC_URL_FALLBACK: 'not a url',
    }),
    /malformed value\(s\) for CHAIN_SOLANA_DEVNET_RPC_URL_FALLBACK/,
  )
})

test('dispute authority resolves independently for Solana and EVM', () => {
  const solana = loadChainSecrets({
    ...solanaEnv(),
    CHAIN_SOLANA_DEVNET_DISPUTE_ADMIN_ADDR: SOL,
  })
  const evm = loadChainSecrets({ ...evmEnv(), CHAIN_EIP155_8453_DISPUTE_ADMIN_ADDR: EVM })
  assert.equal(solana.get('solana:devnet')?.disputeAdmin, SOL)
  assert.equal(evm.get('eip155:8453')?.disputeAdmin, EVM)
})

test('dispute authority is optional and validates its namespace format', () => {
  assert.equal(loadChainSecrets(solanaEnv()).get('solana:devnet')?.disputeAdmin, undefined)
  assert.throws(
    () => loadChainSecrets({ ...solanaEnv(), CHAIN_SOLANA_DEVNET_DISPUTE_ADMIN_ADDR: EVM }),
    /malformed value\(s\) for CHAIN_SOLANA_DEVNET_DISPUTE_ADMIN_ADDR/,
  )
})
