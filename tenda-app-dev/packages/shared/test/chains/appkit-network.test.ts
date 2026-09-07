import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHAIN_MANIFEST, type ChainManifestEntry } from '../../src/chains/manifest'
import { evmAppKitNetworkOf, evmAppKitNetworks } from '../../src/chains/appkit-network'
import { evmChainNumericId, evmManifestEntries, nativeCurrencyOf } from '../../src/chains/manifest-queries'

// The derivation is what makes a new EVM chain zero client code: web, admin
// and mobile all build their AppKit network lists from it, so these tests are
// the contract those three wallet runtimes boot against.

test('every EVM manifest chain derives a network from its own manifest facts', () => {
  for (const entry of evmManifestEntries()) {
    const network = evmAppKitNetworkOf(entry)
    assert.equal(network.id, evmChainNumericId(entry.id), entry.id)
    assert.equal(network.caipNetworkId, entry.id, entry.id)
    assert.equal(network.name, entry.displayName, entry.id)
    assert.deepEqual(network.rpcUrls.default.http, [entry.publicRpcUrl], entry.id)
    assert.equal(network.blockExplorers.default.url, entry.explorerUrl, entry.id)
    assert.deepEqual(network.nativeCurrency, nativeCurrencyOf(entry), entry.id)
    assert.equal(network.chainNamespace, 'eip155', entry.id)
    assert.equal(network.testnet, entry.kind === 'testnet', entry.id)
  }
})

test('evmAppKitNetworks covers exactly the EVM manifest chains, in manifest order', () => {
  const derivedIds = evmAppKitNetworks().map((n) => n.caipNetworkId)
  const manifestIds = CHAIN_MANIFEST.filter((c) => c.namespace === 'eip155').map((c) => c.id)
  assert.deepEqual(derivedIds, manifestIds)
})

// A synthetic entry that is NOT in CHAIN_MANIFEST. Reuses a real native asset
// id (the derivation resolves display metadata through ASSET_META, which only
// knows registered assets — exactly what a future chain would do too).
function syntheticEvmEntry(): ChainManifestEntry {
  const template = evmManifestEntries()[0]
  if (template === undefined) throw new Error('manifest has no EVM chain to template from')
  return {
    id: 'eip155:424242',
    namespace: 'eip155',
    family: 'synthetic',
    kind: 'testnet', status: 'live',
    displayName: 'Synthetic Testnet',
    minConfirmations: 1,
    publicRpcUrl: 'https://rpc.synthetic.example',
    explorerUrl: 'https://scan.synthetic.example',
    gasPolicy: 'none',
    assets: template.assets,
  }
}

test('derives a network for an EVM entry with NO hand mapping anywhere (new-chain contract)', () => {
  const network = evmAppKitNetworkOf(syntheticEvmEntry())
  assert.equal(network.id, 424242)
  assert.equal(network.caipNetworkId, 'eip155:424242')
  assert.deepEqual(network.rpcUrls.default.http, ['https://rpc.synthetic.example'])
  assert.equal(network.testnet, true)
})

test('an EVM entry missing its public URLs is refused, never half-derived', () => {
  const noRpc: ChainManifestEntry = { ...syntheticEvmEntry(), publicRpcUrl: undefined }
  assert.throws(() => evmAppKitNetworkOf(noRpc), /missing publicRpcUrl or explorerUrl/)
  const noExplorer: ChainManifestEntry = { ...syntheticEvmEntry(), explorerUrl: undefined }
  assert.throws(() => evmAppKitNetworkOf(noExplorer), /missing publicRpcUrl or explorerUrl/)
})

test('a non-EVM entry is refused (the numeric-id parse is the guard)', () => {
  const solana = CHAIN_MANIFEST.find((c) => c.namespace === 'solana')
  if (solana === undefined) throw new Error('manifest has no solana chain')
  // Give it the URLs an EVM entry would have so the refusal is about the
  // namespace, not the missing fields.
  const urled: ChainManifestEntry = {
    ...solana,
    publicRpcUrl: 'https://rpc.example',
    explorerUrl: 'https://scan.example',
  }
  assert.throws(() => evmAppKitNetworkOf(urled), /not a numeric eip155 CAIP-2 id/)
})
