import { describe, expect, it } from 'vitest'
import { getAssetMeta } from '@tenda/shared/constants/assets'
import { registryAsset } from '../registry-asset'

describe('registryAsset', () => {
  it('answers the registry entry for a known asset, the same object the accessor does', () => {
    const expected = getAssetMeta('USDC_SOL')
    expect(expected).not.toBeNull()
    expect(registryAsset('USDC_SOL', 'test')).toBe(expected)
  })

  it('throws for an asset the registry does not carry, naming the surface and the id', () => {
    expect(() => registryAsset('NOT_AN_ASSET', 'exchange assets')).toThrow(
      "landing exchange assets: asset 'NOT_AN_ASSET' is not in the shared asset registry",
    )
  })

  it('treats a PROTOTYPE KEY as unknown, not as an entry — the whole point of the accessor', () => {
    // A bracket read answers each of these with a truthy inherited function, so
    // `meta.symbol` is undefined and the page prints nonsense with nothing
    // throwing. The helper must refuse them like any other unknown id.
    for (const key of ['toString', 'constructor', 'hasOwnProperty', 'valueOf', '__proto__']) {
      expect(() => registryAsset(key, 'test'), key).toThrow(/is not in the shared asset registry/)
    }
  })

  it('treats the empty string as unknown', () => {
    expect(() => registryAsset('', 'test')).toThrow(/is not in the shared asset registry/)
  })
})
