import { describe, expect, it } from 'vitest'
import { CHAIN_MANIFEST } from '@tenda/shared/chains'
import { LANDING_CHAINS, displayFor, type LandingChain } from '../chains'
import {
  CHAIN_STATUS_DISPLAY,
  LIVE_CHAINS,
  MAINNET_STATUS_CLAUSE,
  PLANNED_CHAINS,
  chainStatus,
  mainnetStatusClause,
  LAUNCHING_CHAINS,
  UNDEPLOYED_CHAINS,
} from '../chain-status'

/**
 * The module exists because the landing answered "do we run on this chain?"
 * with `kind === 'mainnet'` — a fact about the chain, not about Tenda — and
 * advertised four mainnet chains as live while every one of them was
 * undeployed. These tests hold the answer to the manifest's DECLARED status
 * and to nothing else.
 */
describe('chainStatus', () => {
  it('returns exactly what the manifest declares, for every landing chain', () => {
    expect(LANDING_CHAINS.length).toBeGreaterThan(0)
    for (const chain of LANDING_CHAINS) {
      const entry = CHAIN_MANIFEST.find((e) => e.id === chain.id)
      expect(entry, `${chain.id} must come from the manifest`).toBeDefined()
      expect(chainStatus(chain)).toBe(entry?.status)
    }
  })

  it('never reads status off `kind` — a mainnet chain is not live by virtue of being mainnet', () => {
    // The original defect in one assertion. Every landing chain IS a mainnet
    // entry, so if status were still derived from kind they would all be live.
    // While any is planned, that derivation is provably gone.
    const mainnets = CHAIN_MANIFEST.filter((e) => e.kind === 'mainnet' && e.status === 'planned')
    for (const entry of mainnets) {
      const chain = LANDING_CHAINS.find((c) => c.id === entry.id)
      expect(chain, `${entry.id} is a landing chain`).toBeDefined()
      if (chain !== undefined) expect(chainStatus(chain)).toBe('planned')
    }
  })

  it('falls back to planned, never live, for a chain the manifest does not know', () => {
    // Total-function fallback. The direction matters: understating what ships
    // is visible to us, overstating it is what put four phantom contracts on
    // the page.
    const stranger: LandingChain = {
      id: 'eip155:99999',
      family: 'not-a-family',
      namespace: 'eip155',
      gasPolicy: 'none',
      nativeSymbol: 'ETH',
      ...displayFor('not-a-family', 'Nowhere'),
    }
    expect(CHAIN_MANIFEST.some((e) => e.id === stranger.id)).toBe(false)
    expect(chainStatus(stranger)).toBe('planned')
  })

  it('is not fooled by a prototype key masquerading as a chain id', () => {
    // A Map, not an object literal, precisely so this cannot answer with an
    // inherited function. `'constructor' in {}` is true; Map.get is not.
    for (const id of ['constructor', 'toString', '__proto__']) {
      const chain: LandingChain = {
        id,
        family: 'x',
        namespace: 'eip155',
        gasPolicy: 'none',
        nativeSymbol: 'ETH',
        ...displayFor('x', 'X'),
      }
      expect(chainStatus(chain)).toBe('planned')
    }
  })
})

describe('the live / planned split', () => {
  it('partitions the landing chains three ways — none lost, none counted twice', () => {
    const all = [...LIVE_CHAINS, ...LAUNCHING_CHAINS, ...PLANNED_CHAINS]
    expect(all.length).toBe(LANDING_CHAINS.length)
    expect(new Set(all.map((c) => c.id)).size).toBe(LANDING_CHAINS.length)
  })

  it('UNDEPLOYED_CHAINS is exactly launching + planned, the guard\'s bucket', () => {
    // The whole-page guard iterates this one. If it ever drifted to mean only
    // `planned`, a launching chain could be described as deployed and nothing
    // would notice — which is the shape of the original bug.
    expect(UNDEPLOYED_CHAINS.map((c) => c.id).sort()).toEqual(
      [...LAUNCHING_CHAINS, ...PLANNED_CHAINS].map((c) => c.id).sort(),
    )
    for (const chain of UNDEPLOYED_CHAINS) expect(chainStatus(chain)).not.toBe('live')
  })

  it('puts each chain on the side its manifest status says', () => {
    for (const chain of LIVE_CHAINS) expect(chainStatus(chain)).toBe('live')
    for (const chain of PLANNED_CHAINS) expect(chainStatus(chain)).toBe('planned')
  })

  it('renders each side into the clause under its own heading', () => {
    // Asserted through the clause rather than through name-list exports: those
    // had no caller outside this file, and an export nothing consumes is a
    // claim nothing checks.
    const clause = mainnetStatusClause(LIVE_CHAINS, LAUNCHING_CHAINS, PLANNED_CHAINS)
    for (const chain of LANDING_CHAINS) expect(clause).toContain(chain.name)
  })
})

describe('status presentation', () => {
  it('labels all three statuses, and does not soften "planned" into a promise', () => {
    expect(CHAIN_STATUS_DISPLAY.live.label).toBe('Live')
    expect(CHAIN_STATUS_DISPLAY.launching.label).toBe('Launching')
    expect(CHAIN_STATUS_DISPLAY.planned.label).toBe('Planned')
    // "Coming soon" is the same claim in a quieter voice — it still tells a
    // reader the chain is nearly usable, which is the impression this whole
    // change exists to remove.
    expect(CHAIN_STATUS_DISPLAY.planned.label.toLowerCase()).not.toContain('soon')
  })

  it('gives all three statuses visibly different tones', () => {
    // A "Launching" badge that looks identical to "Live" would put the claim
    // back on the page in colour after taking it out of the words.
    const tones = Object.values(CHAIN_STATUS_DISPLAY).map((d) => d.tone)
    expect(new Set(tones).size).toBe(tones.length)
  })
})

describe('mainnetStatusClause across every state the manifest can reach', () => {
  // Called with arguments because almost none of these states can occur today,
  // and the two that matter most — the launch chain being named alone, and the
  // first mainnet going live — have never run.
  const chain = (name: string): LandingChain => ({
    id: `eip155:${name.length}`,
    family: name.toLowerCase(),
    namespace: 'eip155',
    gasPolicy: 'none',
    nativeSymbol: 'ETH',
    ...displayFor(name.toLowerCase(), name),
  })
  const zeroG = chain('Zero')
  const solana = chain('Sol')
  const base = chain('Basechain')

  /**
   * The regression this third status exists for.
   *
   * With one bucket for everything not live, the clause read "mainnet launching
   * on Zero, Sol and Basechain" — four launches announced when one chain was
   * being deployed. A launch is a schedule claim; it may name only the chain
   * actually being shipped to.
   */
  it('claims a launch ONLY for the chain being deployed', () => {
    const clause = mainnetStatusClause([], [zeroG], [solana, base])
    expect(clause).toBe('launching on Zero, with Sol and Basechain to follow')
    // The precise failure: no unscheduled chain may sit under the launch verb.
    expect(clause).not.toMatch(/launching on [^,]*\b(Sol|Basechain)\b/)
  })

  it('after the launch chain deploys: it moves to live, the rest stay to follow', () => {
    // The state #13 produces.
    expect(mainnetStatusClause([zeroG], [], [solana, base])).toBe(
      'live on Zero, with Sol and Basechain to follow',
    )
  })

  it('carries live, launching and planned at once when all three exist', () => {
    expect(mainnetStatusClause([zeroG], [solana], [base])).toBe(
      'live on Zero, launching on Sol, with Basechain to follow',
    )
  })

  it('once every chain ships: no trailing "to follow" for an empty list', () => {
    expect(mainnetStatusClause([zeroG, solana], [], [])).toBe('live on Zero and Sol')
  })

  it('nothing live and nothing launching: promises, without a launch date', () => {
    const clause = mainnetStatusClause([], [], [solana, base])
    expect(clause).toBe('with Sol and Basechain to follow')
    expect(clause).not.toContain('launching')
    expect(clause).not.toContain('live on')
  })

  it('a manifest with no mainnet at all yields no clause, not a dangling phrase', () => {
    const clause = mainnetStatusClause([], [], [])
    expect(clause).toBe('')
    expect(clause).not.toMatch(/\bon\s*$/)
  })
})

describe('MAINNET_STATUS_CLAUSE', () => {
  it('says something, and never trails off with a dangling preposition', () => {
    expect(MAINNET_STATUS_CLAUSE).not.toBe('')
    expect(MAINNET_STATUS_CLAUSE.trim()).toBe(MAINNET_STATUS_CLAUSE)
    expect(MAINNET_STATUS_CLAUSE).not.toMatch(/\b(on|with)\s*$/)
  })

  it('claims nothing is live while nothing is', () => {
    if (LIVE_CHAINS.length > 0) {
      expect(MAINNET_STATUS_CLAUSE).toContain('live on')
      return
    }
    expect(MAINNET_STATUS_CLAUSE).not.toContain('live on')
  })

  it('mentions a launch only when a chain is actually being deployed to', () => {
    expect(MAINNET_STATUS_CLAUSE.includes('launching on')).toBe(LAUNCHING_CHAINS.length > 0)
  })

  it('accounts for every chain, whichever bucket it sits in', () => {
    for (const chain of LANDING_CHAINS) expect(MAINNET_STATUS_CLAUSE).toContain(chain.name)
  })
})
