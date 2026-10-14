/**
 * `assetFundsBySignature` — the one predicate behind both the relay's 422
 * RELAY_UNSUPPORTED_ASSET and the registry's `funds_by_signature` (#146).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHAIN_MANIFEST, type ChainAsset } from '../../src/chains/manifest'
import { assetFundsBySignature } from '../../src/chains/manifest-queries'
import { INHERITED_OBJECT_KEYS } from '../helpers/inherited-keys'

const solana = CHAIN_MANIFEST.find((c) => c.namespace === 'solana')
const evmWith3009 = CHAIN_MANIFEST.flatMap((c) =>
  c.namespace === 'eip155' ? c.assets.filter((a) => a.eip3009 === true).map((a) => ({ chain: c.id, asset: a.id })) : [],
)
const evmPermitOnly = CHAIN_MANIFEST.flatMap((c) =>
  c.namespace === 'eip155'
    ? c.assets.filter((a) => a.permit !== undefined && a.eip3009 === undefined).map((a) => ({ chain: c.id, asset: a.id }))
    : [],
)
const evmNative = CHAIN_MANIFEST.flatMap((c) =>
  c.namespace === 'eip155' ? c.assets.filter((a) => a.token === null).map((a) => ({ chain: c.id, asset: a.id })) : [],
)
assert.ok(solana !== undefined && evmWith3009.length > 0 && evmNative.length > 0, 'the manifest needs each shape for these to mean anything')

test('Solana: every listed asset funds by signature — the creator signs the whole transaction', () => {
  for (const asset of solana.assets) assert.equal(assetFundsBySignature(solana.id, asset.id), true, asset.id)
})

test('EVM: only an asset declaring EIP-3009 under a permit domain does', () => {
  for (const { chain, asset } of evmWith3009) assert.equal(assetFundsBySignature(chain, asset), true, `${chain} ${asset}`)
  for (const { chain, asset } of evmPermitOnly) assert.equal(assetFundsBySignature(chain, asset), false, `${chain} ${asset} is permit-only`)
  for (const { chain, asset } of evmNative) assert.equal(assetFundsBySignature(chain, asset), false, `${chain} ${asset} is native`)
})

test('EVM: permit without EIP-3009, and EIP-3009 without permit, both answer false — on a fixture, since the real manifest has neither', () => {
  // MEASURED before this case existed: dropping the eip3009 clause from the
  // predicate left every case in this file green, because `evmPermitOnly`
  // above is EMPTY for the real manifest. The clause has to be reached.
  const [{ chain, asset }] = evmWith3009
  const entry = CHAIN_MANIFEST.find((c) => c.id === chain)
  assert.ok(entry !== undefined)
  const withAsset = (patch: (a: ChainAsset) => ChainAsset) =>
    CHAIN_MANIFEST.map((c) => (c.id === chain ? { ...c, assets: c.assets.map((a) => (a.id === asset ? patch(a) : a)) } : c))
  const permitOnly = withAsset(({ eip3009: _dropped, ...rest }) => rest)
  const authorizationOnly = withAsset(({ permit: _dropped, ...rest }) => rest)
  assert.equal(assetFundsBySignature(chain, asset, permitOnly), false, 'permit alone is EIP-2612, not a funding path')
  assert.equal(assetFundsBySignature(chain, asset, authorizationOnly), false, 'EIP-3009 needs the permit domain it reuses')
  assert.equal(assetFundsBySignature(chain, asset), true, 'and the real entry, untouched, still funds')
})

test('an asset the chain does not list, an unknown chain, and a prototype key all answer false', () => {
  assert.equal(assetFundsBySignature(solana.id, 'NOT_LISTED'), false)
  assert.equal(assetFundsBySignature('eip155:1', 'USDC_BASE'), false)
  for (const key of INHERITED_OBJECT_KEYS) {
    assert.equal(assetFundsBySignature(solana.id, key), false, key)
    assert.equal(assetFundsBySignature(key, 'USDC_BASE'), false, key)
  }
})

test('the manifest never declares EIP-3009 without a permit domain — the guard the predicate relies on', () => {
  for (const c of CHAIN_MANIFEST) for (const a of c.assets) if (a.eip3009 === true) assert.ok(a.permit !== undefined, `${c.id} ${a.id}`)
})
