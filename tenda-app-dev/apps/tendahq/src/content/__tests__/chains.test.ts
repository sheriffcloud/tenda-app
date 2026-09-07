import { describe, expect, it } from 'vitest'
import { CHAIN_MANIFEST } from '@tenda/shared/chains'
import {
  ACTIVE_GAS_POLICIES,
  CHAIN_NAMES_LINE,
  CHAIN_NAMES_PROSE,
  CHAIN_STRENGTHS_PROSE,
  EVM_CHAIN_NAMES_PROSE,
  EXCHANGE_ASSET_SYMBOLS_PROSE,
  LANDING_CHAINS,
  SOLANA_CHAIN_NAMES_PROSE,
  chainByFamily,
  chainNamesProseByNamespace,
  chainsByGasPolicy,
  displayFor,
  explorerHost,
  transportFor,
  GIG_ASSET_IDS,
} from '../chains'
import { ASSET_META } from '@tenda/shared/constants/assets'

const mainnet = CHAIN_MANIFEST.filter((c) => c.kind === 'mainnet')

describe('landing chain registry', () => {
  /**
   * Marketing must never name a testnet. This is the invariant that lets every
   * other derived string be printed without a second thought.
   */
  it('surfaces mainnet entries only — 0G first, the rest in manifest order', () => {
    // Same SET as the manifest's mainnet entries — nothing invented, nothing
    // dropped by the ordering pass.
    expect([...LANDING_CHAINS.map((c) => c.id)].sort()).toEqual(
      [...mainnet.map((c) => c.id)].sort(),
    )
    // 0G leads every chain mention (launch positioning, 2026-08-27)…
    expect(LANDING_CHAINS[0]?.family).toBe('0g')
    // …and the rest keep their manifest relative order (stable sort).
    expect(LANDING_CHAINS.slice(1).map((c) => c.id)).toEqual(
      mainnet.filter((c) => c.family !== '0g').map((c) => c.id),
    )
    for (const chain of LANDING_CHAINS) {
      expect(CHAIN_MANIFEST.find((c) => c.id === chain.id)?.kind).toBe('mainnet')
    }
  })

  /**
   * Adding a chain is a manifest entry plus secrets; the marketing row may
   * follow later. That gap must degrade, not break — and `strength` must fall
   * back to EMPTY so the strengths sentence skips the chain rather than
   * rendering "Optimism's " with nothing after it.
   */
  it('falls back to the manifest display name for a family with no marketing row', () => {
    const fallback = displayFor('not-a-family', 'Optimism')
    expect(fallback.name).toBe('Optimism')
    expect(fallback.glyph).toBe('●')
    expect(fallback.color).toBe('var(--brand-primary)')
    expect(fallback.pitch).toBe('')
    expect(fallback.strength).toBe('')
  })

  it('prefers the marketing row over the manifest display name when one exists', () => {
    const solana = displayFor('solana', 'SOLANA-UPPERCASE')
    expect(solana.name).toBe('Solana')
    expect(solana.strength).not.toBe('')
  })

  /**
   * Gigs are USDC-only, and §04's worked example takes its base-unit scale from
   * this asset's decimals. An empty list would silently make that example wrong
   * by whatever factor the fallback picked, so the invariant is asserted rather
   * than assumed: every shipped chain carries gigs.
   */
  it('gives every shipped chain a gig asset, all with the same decimals', () => {
    expect(GIG_ASSET_IDS).toHaveLength(LANDING_CHAINS.length)
    const decimals = new Set(GIG_ASSET_IDS.map((id) => ASSET_META[id].decimals))
    expect(decimals.size).toBe(1)
    expect([...decimals][0]).toBe(6)
    for (const id of GIG_ASSET_IDS) expect(ASSET_META[id].symbol).toBe('USDC')
  })

  it('carries a native symbol for every chain', () => {
    for (const chain of LANDING_CHAINS) {
      expect(chain.nativeSymbol).not.toBe('')
    }
  })

  it('groups chains by gas policy without losing any', () => {
    const grouped = ACTIVE_GAS_POLICIES.flatMap((p) => chainsByGasPolicy(p))
    expect(grouped).toHaveLength(LANDING_CHAINS.length)
    expect(ACTIVE_GAS_POLICIES).toEqual([...new Set(LANDING_CHAINS.map((c) => c.gasPolicy))])
  })

  it('groups chains by their declared gas policy, and yields nothing for an unused one', () => {
    // 0G moved from 'none' to 'native-seed' on 2026-08-31, joining Solana on
    // the gas-grant card. Asserted as a GROUPING rather than by naming the
    // policy each chain happens to hold, so the next such move does not need
    // this test rewritten — only the manifest.
    for (const policy of ['native-seed', 'feeCurrency', 'paymaster', 'none'] as const) {
      for (const chain of chainsByGasPolicy(policy)) expect(chain.gasPolicy).toBe(policy)
    }
    expect(chainsByGasPolicy('native-seed').map((c) => c.family).sort()).toEqual(['0g', 'solana'])
    expect(chainsByGasPolicy('none')).toEqual([])
  })

  it('finds a chain by manifest family, and nothing for an unknown one', () => {
    expect(chainByFamily(LANDING_CHAINS[0].family)?.id).toBe(LANDING_CHAINS[0].id)
    expect(chainByFamily('not-a-family')).toBeUndefined()
  })

  it('splits the wallet story by namespace, covering every chain exactly once', () => {
    expect(chainNamesProseByNamespace('nope')).toBe('')
    const solana = LANDING_CHAINS.filter((c) => c.namespace === 'solana')
    const evm = LANDING_CHAINS.filter((c) => c.namespace === 'eip155')
    expect(solana.length + evm.length).toBe(LANDING_CHAINS.length)
    for (const chain of solana) expect(SOLANA_CHAIN_NAMES_PROSE).toContain(chain.name)
    for (const chain of evm) expect(EVM_CHAIN_NAMES_PROSE).toContain(chain.name)
  })

  it('renders the stamp line and the prose line from the same names', () => {
    for (const chain of LANDING_CHAINS) {
      expect(CHAIN_NAMES_LINE).toContain(chain.name)
      expect(CHAIN_NAMES_PROSE).toContain(chain.name)
    }
    expect(CHAIN_NAMES_LINE).toContain(' · ')
    expect(CHAIN_NAMES_PROSE).not.toContain(' · ')
  })

  /**
   * The strengths sentence sits beside a derived chain list, so a chain missing
   * from it is a sentence that explains fewer chains than it just named.
   */
  it('gives every shipped chain a strength phrase', () => {
    for (const chain of LANDING_CHAINS) {
      expect(chain.strength).not.toBe('')
      expect(CHAIN_STRENGTHS_PROSE).toContain(chain.strength)
      expect(CHAIN_STRENGTHS_PROSE).toContain(chain.name)
    }
  })

  it('never renders a possessive with nothing after it', () => {
    expect(CHAIN_STRENGTHS_PROSE).not.toMatch(/’s(,| and |$)/)
  })

  /**
   * Gigs are USDC-only (`assertGigAsset`); the exchange trades a wider set.
   * The copy lists the exchange set, so it must match the manifest's roles —
   * hand-listed it said "USDC, SOL or ETH" and silently dropped cUSD and CELO.
   */
  it('lists every exchange-role asset symbol, deduped, stablecoins first', () => {
    const symbols = EXCHANGE_ASSET_SYMBOLS_PROSE.split(/,\s|\sand\s/)
    expect(new Set(symbols).size).toBe(symbols.length)
    expect(symbols[0]).toBe('USDC')
    expect(symbols).toContain('cUSD')
    expect(symbols).toContain('CELO')
    // Every mainnet chain's exchange assets must be represented.
    const expected = new Set(
      mainnet.flatMap((c) => c.assets.filter((a) => a.roles.includes('exchange')).map((a) => a.id)),
    )
    expect(expected.size).toBeGreaterThan(symbols.length) // ids outnumber symbols (USDC × 3)
  })
})

/**
 * Two accessors the networks section reads. Both have a fallback path that no
 * shipped chain currently takes, which is exactly why they are tested here:
 * the day a chain does take one, this is what says whether it degrades or
 * breaks the page.
 */
describe('network reference accessors', () => {
  it('names the transport for every namespace we ship', () => {
    for (const chain of LANDING_CHAINS) {
      expect(transportFor(chain.namespace)).not.toBe('')
    }
  })

  it('splits transport on namespace, not on chain', () => {
    expect(transportFor('solana')).toBe('Mobile Wallet Adapter')
    expect(transportFor('eip155')).toBe('WalletConnect')
    const evm = LANDING_CHAINS.filter((c) => c.namespace === 'eip155')
    expect(evm.length).toBeGreaterThan(1)
    expect(new Set(evm.map((c) => transportFor(c.namespace))).size).toBe(1)
  })

  /**
   * Empty, not a guess. The card omits the row rather than printing a label
   * above a blank or inventing an adapter the product does not have.
   */
  it('returns empty for a namespace with no adapter', () => {
    expect(transportFor('cosmos')).toBe('')
    expect(transportFor('')).toBe('')
  })

  /**
   * INHERITED KEYS ARE NOT ENTRIES. A plain object literal carries
   * Object.prototype, so `map['toString']` is the inherited function — truthy,
   * so a `?? ''` fallback never fires and a `string`-typed accessor hands back
   * a function. `transportFor` and `flagFor` both did; `displayFor` returned
   * name "Object" for 'constructor' and "toString" for 'toString', in place of
   * the manifest display name it was handed.
   *
   * No manifest namespace or family spells any of these, so nothing shipped
   * wrong — but a lookup that answers for keys it does not contain is wrong
   * whether or not today's data reaches it, and these are cheap to pin.
   */
  it('answers only for keys it actually contains', () => {
    for (const key of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(transportFor(key)).toBe('')
      expect(typeof transportFor(key)).toBe('string')

      const display = displayFor(key, 'Optimism')
      expect(display.name).toBe('Optimism')
      expect(display.glyph).toBe('●')
      expect(display.color).toBe('var(--brand-primary)')
      expect(display.strength).toBe('')
    }
  })

  it('reduces an explorer URL to its host', () => {
    expect(explorerHost('https://solscan.io/')).toBe('solscan.io')
    expect(explorerHost('https://basescan.org/tx/0xabc')).toBe('basescan.org')
  })

  /**
   * The reason this is a function and not `new URL(...)` inline in the card:
   * `new URL` THROWS on a malformed input, and the value reaches a component's
   * render straight from the manifest. A bad explorer URL should cost one ugly
   * link, not the whole page.
   */
  it('falls back to the raw string instead of throwing on a malformed URL', () => {
    expect(() => explorerHost('not a url')).not.toThrow()
    expect(explorerHost('not a url')).toBe('not a url')
    expect(explorerHost('')).toBe('')
  })

  it('gives every shipped chain a parseable explorer URL', () => {
    for (const chain of LANDING_CHAINS) {
      if (chain.explorerUrl === undefined) continue
      expect(explorerHost(chain.explorerUrl)).not.toBe(chain.explorerUrl)
      expect(explorerHost(chain.explorerUrl)).toContain('.')
    }
  })
})
