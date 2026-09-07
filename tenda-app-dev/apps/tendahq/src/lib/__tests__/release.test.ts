import { describe, expect, it } from 'vitest'
import { releaseStage, versionNumber } from '../release'

/**
 * The mainnet branch of both functions has never run in production, and it is
 * the one that has to be right on launch day — a release cut with no suffix
 * must flip every network-stage line on the page at once. These tests exercise
 * it now rather than discovering it then.
 */
describe('releaseStage', () => {
  it('reads a qualifier as "<qualifier> release"', () => {
    expect(releaseStage('v0.4.3-testnet')).toBe('testnet release')
  })

  it('reads NO qualifier as mainnet — the launch-day path', () => {
    expect(releaseStage('v1.0.0')).toBe('mainnet')
  })

  it('keeps a dotted or multi-part qualifier whole', () => {
    expect(releaseStage('v1.0.0-rc.1')).toBe('rc.1 release')
    expect(releaseStage('v1.0.0-beta-2')).toBe('beta-2 release')
  })

  it('stays lower-case so it reads correctly mid-sentence in both states', () => {
    expect(releaseStage('v1.0.0')).toBe(releaseStage('v1.0.0').toLowerCase())
    expect(releaseStage('v0.4.3-testnet')).toBe(releaseStage('v0.4.3-testnet').toLowerCase())
  })
})

describe('versionNumber', () => {
  it('strips a qualifier', () => {
    expect(versionNumber('v0.4.3-testnet')).toBe('v0.4.3')
  })

  it('leaves an unqualified version untouched — the launch-day path', () => {
    expect(versionNumber('v1.0.0')).toBe('v1.0.0')
  })

  it('cuts at the FIRST separator, not the last', () => {
    expect(versionNumber('v1.0.0-beta-2')).toBe('v1.0.0')
  })

  it('never returns a value still carrying a qualifier', () => {
    for (const v of ['v0.4.3-testnet', 'v1.0.0', 'v2.1.0-rc.1']) {
      expect(versionNumber(v)).not.toContain('-')
    }
  })
})
