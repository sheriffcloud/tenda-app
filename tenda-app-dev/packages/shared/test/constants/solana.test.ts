import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SOLANA_TX_FEE_LAMPORTS,
  SOLANA_CAIP_BY_NETWORK,
  solanaChainId,
  SOLANA_NATIVE_ASSET_BY_NETWORK,
  solanaNativeAssetId,
} from '../../src/constants/solana'

test('SOLANA_TX_FEE_LAMPORTS is a positive bigint', () => {
  assert.equal(typeof SOLANA_TX_FEE_LAMPORTS, 'bigint')
  assert.ok(SOLANA_TX_FEE_LAMPORTS > 0n)
})

test('solanaChainId: maps cluster names to canonical CAIP-2 ids (note the mainnet-beta asymmetry)', () => {
  assert.equal(solanaChainId('devnet'), 'solana:devnet')
  assert.equal(solanaChainId('mainnet-beta'), 'solana:mainnet')
  assert.equal(SOLANA_CAIP_BY_NETWORK['mainnet-beta'], 'solana:mainnet')
})

test('solanaChainId: throws loudly on an unknown network', () => {
  assert.throws(() => solanaChainId('testnet'), /unsupported Solana network 'testnet'/)
  assert.throws(() => solanaChainId('mainnet'), /unsupported Solana network/) // not the cluster name
})

test('solanaNativeAssetId: maps cluster to the seeded native asset id', () => {
  assert.equal(solanaNativeAssetId('devnet'), 'SOL_DEVNET')
  assert.equal(solanaNativeAssetId('mainnet-beta'), 'SOL')
  assert.equal(SOLANA_NATIVE_ASSET_BY_NETWORK.devnet, 'SOL_DEVNET')
})

test('solanaNativeAssetId: throws on an unknown network', () => {
  assert.throws(() => solanaNativeAssetId('testnet'), /unsupported Solana network 'testnet'/)
})
