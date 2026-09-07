import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ASSET_META,
  GIG_STABLE_MIN_RAW,
  GIG_STABLE_MAX_RAW,
  amountRawToDisplay,
  formatAssetAmount,
} from '../../src/constants/assets'

test('ASSET_META: every entry has a symbol, non-negative decimals, boolean is_stable, coingeckoId', () => {
  for (const [id, meta] of Object.entries(ASSET_META)) {
    assert.ok(meta.symbol.length > 0, `${id} symbol`)
    assert.ok(Number.isInteger(meta.decimals) && meta.decimals >= 0, `${id} decimals`)
    assert.equal(typeof meta.is_stable, 'boolean', `${id} is_stable`)
    assert.ok(meta.coingeckoId.length > 0, `${id} coingeckoId`)
  }
})

test('ASSET_META: stablecoins are flagged, native coins are not', () => {
  assert.equal(ASSET_META.USDC_SOL.is_stable, true)
  assert.equal(ASSET_META.USDC_BASE.is_stable, true)
  assert.equal(ASSET_META.cUSD.is_stable, true)
  assert.equal(ASSET_META.SOL.is_stable, false)
  assert.equal(ASSET_META.ETH_BASE.is_stable, false)
})

test('ASSET_META: native gas tokens carry a long-form name for AppKit nativeCurrency', () => {
  assert.equal(ASSET_META.ETH_BASE.name, 'Ether')
  assert.equal(ASSET_META.CELO.name, 'Celo')
  assert.equal(ASSET_META.SOL.name, 'Solana')
})

test('GIG_STABLE bounds are ordered and positive', () => {
  assert.ok(GIG_STABLE_MIN_RAW > 0)
  assert.ok(GIG_STABLE_MAX_RAW > GIG_STABLE_MIN_RAW)
})

test('amountRawToDisplay: divides by 10**decimals per asset', () => {
  assert.equal(amountRawToDisplay('5000000', 'USDC_SOL'), 5) // 6dp
  assert.equal(amountRawToDisplay('50000000', 'SOL'), 0.05) // 9dp
  assert.equal(amountRawToDisplay('0', 'USDC_SOL'), 0)
})

test('amountRawToDisplay: unknown asset falls back to the raw numeric value', () => {
  assert.equal(amountRawToDisplay('1234', 'MYSTERY'), 1234)
})

test('formatAssetAmount: renders value + symbol, rounding display to 4 dp', () => {
  assert.equal(formatAssetAmount('5000000', 'USDC_SOL'), '5 USDC')
  assert.equal(formatAssetAmount('50000000', 'SOL'), '0.05 SOL')
})

test('formatAssetAmount: unknown asset uses the asset id as the symbol', () => {
  assert.equal(formatAssetAmount('1000', 'MYSTERY'), '1,000 MYSTERY')
})
