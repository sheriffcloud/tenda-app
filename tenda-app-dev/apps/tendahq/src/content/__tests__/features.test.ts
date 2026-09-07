import { describe, expect, it } from 'vitest'
import { ACTIVE_GAS_POLICIES, LANDING_CHAINS, chainsByGasPolicy } from '../chains'
import {
  GAS_FREE_START_SENTENCE,
  ONBOARDING_FEATURES,
  featureFor,
  gasFreeSentence,
  statusFor,
} from '../features'
import { CHAIN_MANIFEST } from '@tenda/shared/chains'
import { AGENT_BADGE_LABEL } from '@tenda/shared/constants/users'
import { displayFor, type LandingChain } from '../chains'

/**
 * The onboarding cards are the page's claim that gas is not in your way. Two
 * things must hold and neither is visible by reading the file: every card's
 * chain names come from the manifest, and no card in `live` describes a rail
 * the code cannot perform (the Base paymaster shipped as "in progress" on a
 * build path that is invalid ERC-4337 — that is what these guard against).
 */
describe('onboarding features', () => {
  it('derives one card per gas policy that has copy, plus the wallet card', () => {
    const withChains = ONBOARDING_FEATURES.filter((f) => f.chains.length > 0)
    const crossChain = ONBOARDING_FEATURES.filter((f) => f.chains.length === 0)
    expect(crossChain.map((f) => f.id)).toEqual(['any-wallet', 'fiat-onramp'])
    for (const feature of withChains) {
      expect(ACTIVE_GAS_POLICIES).toContain(feature.chains[0].gasPolicy)
    }
  })

  it('gives every card a unique id, tab, title, body and fact', () => {
    const ids = ONBOARDING_FEATURES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Tabs are the selector rail — a duplicate label makes two rails
    // indistinguishable; an empty one renders a blank pill.
    const tabs = ONBOARDING_FEATURES.map((f) => f.tab)
    expect(new Set(tabs).size).toBe(tabs.length)
    for (const f of ONBOARDING_FEATURES) {
      expect(f.tab).not.toBe('')
      expect(f.title).not.toBe('')
      expect(f.body).not.toBe('')
      expect(f.fact).not.toBe('')
    }
  })

  /** Every chain on a card must be one the card's policy actually covers. */
  it('puts each chain on the card for its own gas policy', () => {
    // Scoped to the DERIVED policy cards. The two 0G agent cards are
    // hand-written and carry that chain deliberately, so reading a policy off
    // their first chain and demanding the whole group back was only ever true
    // while no hand-written card shared a policy with a derived one — which
    // stopped being true the moment 0G took 'native-seed'.
    for (const policy of ACTIVE_GAS_POLICIES) {
      const card = featureFor(policy)
      if (card === null) continue
      expect(card.chains).toEqual(chainsByGasPolicy(policy))
    }
  })

  it('names every covered chain in its own card body', () => {
    for (const feature of ONBOARDING_FEATURES) {
      for (const chain of feature.chains) {
        expect(feature.body).toContain(chain.name)
      }
    }
  })

  it('orders rails that EXIST before rails that do not', () => {
    // Split on 'roadmap', not on 'live'. Splitting on 'live' was correct with
    // two statuses; with three it grouped every built-but-unreachable rail
    // WITH the unbuilt ones, so the section led with a Roadmap card and then
    // interleaved Testnet and Roadmap pills down the rail.
    const lastBuilt = ONBOARDING_FEATURES.map((f) => f.status).reduce(
      (last, status, i) => (status === 'roadmap' ? last : i),
      -1,
    )
    const firstRoadmap = ONBOARDING_FEATURES.findIndex((f) => f.status === 'roadmap')
    if (firstRoadmap !== -1) expect(firstRoadmap).toBeGreaterThan(lastBuilt)
  })

  /**
   * Onboarding's 0G presence (decided 2026-08-27). The card was pinned to
   * `roadmap` when sign-only funding was designed but unbuilt; the rail then
   * shipped (#18 fund route, #19 agent API, #20 a full hire settling on 0G
   * Galileo) and this pin kept the stale label in place. Its status is now
   * DERIVED from the chain it names, so it tracks the deploy instead of a
   * literal somebody has to remember to update.
   */
  it('rides the 0G chain, with a status derived from that chain', () => {
    const agent = ONBOARDING_FEATURES.find((f) => f.id === 'agent-signature-funding')
    expect(agent).toBeDefined()
    expect(agent?.chains.map((c) => c.family)).toEqual(['0g'])
    // Built, so never roadmap; live exactly when 0G is.
    expect(agent?.status).not.toBe('roadmap')
    expect(agent?.status).toBe(statusFor('built', agent?.chains ?? []))
    // It used to be pinned as the FIRST roadmap card. It is not a roadmap card
    // any more, so the pin that matters is that it still sits ahead of them —
    // 0G-first positioning survives the rail shipping.
    const firstRoadmap = ONBOARDING_FEATURES.findIndex((f) => f.status === 'roadmap')
    const agentIndex = ONBOARDING_FEATURES.findIndex((f) => f.id === 'agent-signature-funding')
    if (firstRoadmap !== -1) expect(agentIndex).toBeLessThan(firstRoadmap)
  })

  /**
   * A roadmap card must not read as available. This is the specific regression:
   * "Sponsored transactions through Base Paymaster are in the works" claimed a
   * mechanism whose server build path the mobile client rejects outright.
   */
  it('marks the paymaster rail as roadmap and never as shipped', () => {
    const paymasterChains = chainsByGasPolicy('paymaster')
    if (paymasterChains.length === 0) return
    const card = ONBOARDING_FEATURES.find((f) => f.chains.some((c) => c.gasPolicy === 'paymaster'))
    expect(card?.status).toBe('roadmap')
    expect(card?.fact.toLowerCase()).toContain('roadmap')
  })

  /** No card may name a chain the manifest does not ship. */
  it('never names a chain outside the shipped set', () => {
    const shipped = LANDING_CHAINS.map((c) => c.name)
    for (const feature of ONBOARDING_FEATURES) {
      for (const chain of feature.chains) expect(shipped).toContain(chain.name)
    }
  })
})

describe('feature guards', () => {
  /**
   * `none` means the user simply pays their own gas. There is no onboarding
   * story to tell, so the card must be ABSENT rather than apologetic — and no
   * chain currently uses the policy, so this path is unreachable through the
   * live manifest and untested unless called directly.
   */
  it('produces no card for a policy with no copy', () => {
    expect(featureFor('none')).toBeNull()
  })

  it('produces a card for every policy a shipped chain actually uses', () => {
    for (const policy of ['native-seed', 'feeCurrency', 'paymaster'] as const) {
      expect(featureFor(policy)).not.toBeNull()
    }
  })
})

describe('the worker-facing 0G card', () => {
  const hire = () => ONBOARDING_FEATURES.find((f) => f.id === 'agent-hires-you')

  it('exists, and rides the launch chain', () => {
    // 0G declares gasPolicy 'none', so it contributes no gas card and the
    // launch chain was absent from the getting-started section entirely.
    expect(hire()).toBeDefined()
    expect(hire()?.chains.map((c) => c.family)).toEqual(['0g'])
  })

  it('takes its status from 0G, so both agent cards move with the deploy', () => {
    const agent = ONBOARDING_FEATURES.find((f) => f.id === 'agent-signature-funding')
    expect(hire()?.status).toBe(statusFor('built', hire()?.chains ?? []))
    expect(hire()?.status).toBe(agent?.status)
    expect(hire()?.status).not.toBe('roadmap')
  })

  it('quotes the badge the app actually renders, rather than a copy of it', () => {
    // If the product relabels agents, hand-typed copy would keep promising a
    // label the UI no longer shows. The constant is the same one PersonCard,
    // GigCard, the poster card and the profile page render.
    // The QUOTED badge, not a bare substring. `toContain(AGENT_BADGE_LABEL)`
    // alone passes on the phrase "an AI agent posts a gig" earlier in the same
    // sentence, so it stayed green when the badge itself was hand-typed to
    // something else — a test that cannot fail for its stated reason.
    expect(hire()?.body).toContain(`“${AGENT_BADGE_LABEL}”`)
  })

  it('promises only the ordinary escrow lifecycle, with no second mechanism', () => {
    // The card's value is that nothing is special: same escrow, same proof,
    // same payout. Anything implying a separate agent-only flow would be a
    // claim the product does not implement.
    const body = hire()?.body ?? ''
    expect(body).toContain('exactly as a person does')
    expect(hire()?.fact).toContain('same escrow')
  })

  it('is addressed to the worker, not to the agent operator', () => {
    // The distinction from AGENT_FEATURE, which is written for someone
    // pointing an agent AT Tenda. Two cards on one chain earn their place only
    // by speaking to different readers.
    const agent = ONBOARDING_FEATURES.find((f) => f.id === 'agent-signature-funding')
    expect(hire()?.title).not.toBe(agent?.title)
    expect(hire()?.tab).not.toBe(agent?.tab)
    expect(hire()?.body).toMatch(/\byou\b/i)
  })
})

describe('statusFor — a card may claim only what is built AND reachable', () => {
  /**
   * A LandingChain standing in for a manifest entry, so the deployment half can
   * be driven from both sides. The ids are real manifest ids and the status
   * comes from the real manifest — nothing here stubs CHAIN_MANIFEST, which
   * would only test the stub.
   */
  const asLanding = (id: string): LandingChain => ({
    id,
    family: 'x',
    namespace: 'eip155',
    gasPolicy: 'none',
    nativeSymbol: 'ETH',
    ...displayFor('x', id),
  })
  const liveId = CHAIN_MANIFEST.find((e) => e.status === 'live')?.id ?? ''
  const undeployedId = CHAIN_MANIFEST.find((e) => e.status !== 'live')?.id ?? ''

  it('has a live and an undeployed chain to work with', () => {
    expect(liveId).not.toBe('')
    expect(undeployedId).not.toBe('')
  })

  it('an unbuilt rail is roadmap, whatever its chains are doing', () => {
    // paymaster's blocker is the ERC-4337 build path, not deployment, so this
    // must stay roadmap even once its chain is live. A status derived only
    // from chains would silently promote it on launch day.
    expect(statusFor('unbuilt', [asLanding(liveId)])).toBe('roadmap')
    expect(statusFor('unbuilt', [asLanding(undeployedId)])).toBe('roadmap')
    expect(statusFor('unbuilt', [])).toBe('roadmap')
  })

  it('a built rail on an undeployed chain is TESTNET, not live', () => {
    // The defect itself: this returned 'live' from a hardcoded string.
    expect(statusFor('built', [asLanding(undeployedId)])).toBe('testnet')
  })

  it('a built rail on a deployed chain is LIVE — the arm that fires on launch day', () => {
    expect(statusFor('built', [asLanding(liveId)])).toBe('live')
  })

  it('one deployed chain among several is enough to make the rail live', () => {
    expect(statusFor('built', [asLanding(undeployedId), asLanding(liveId)])).toBe('live')
  })

  it('a built rail with no chains at all is testnet, never live', () => {
    // Nothing to substantiate a live claim, so it may not make one.
    expect(statusFor('built', [])).toBe('testnet')
  })
})

describe('gas-free start sentence', () => {
  /**
   * These two asserted `'.'` — a lone full stop — and passed, because the
   * builder appended the punctuation whether or not it had a sentence to end.
   * The FAQ embedded the result after "you don't even need gas money to
   * start:", so the state these tests pinned was a paragraph trailing off into
   * "start: ." Nothing may be left behind when there is nothing to say.
   */
  it('says nothing at all for a policy with no gas-free clause', () => {
    expect(gasFreeSentence(['none'])).toBe('')
  })

  it('says nothing at all for a rail that does not exist yet', () => {
    expect(gasFreeSentence(['paymaster'])).toBe('')
  })

  it('leaves no orphaned punctuation behind for any empty combination', () => {
    for (const policies of [[], ['none'], ['paymaster'], ['none', 'paymaster']] as const) {
      const sentence = gasFreeSentence(policies)
      expect(sentence).toBe('')
      expect(sentence).not.toMatch(/^[.\s:]+$/)
    }
  })

  it('carries the whole promise, lead-in included, when a rail can back it', () => {
    // The lead-in moved into the string so the empty case can remove the
    // sentence rather than leave its opening clause stranded in the FAQ.
    const sentence = gasFreeSentence(['feeCurrency'])
    expect(sentence).toContain('USDC')
    expect(sentence).toContain('gas money to start')
    expect(sentence.endsWith('.')).toBe(true)
  })

  it('includes a rail that works on testnet — it is built, and it is reachable there', () => {
    // The distinction #51 introduced. A 'testnet' rail belongs in this sentence
    // (it genuinely works on the networks this release talks to); a 'roadmap'
    // rail does not, because it does not exist.
    expect(featureFor('feeCurrency')?.status).toBe('testnet')
    expect(gasFreeSentence(['feeCurrency'])).not.toBe('')
    expect(featureFor('paymaster')?.status).toBe('roadmap')
    expect(gasFreeSentence(['paymaster'])).toBe('')
  })

  it('describes no rail that does not exist', () => {
    const roadmapChains = ONBOARDING_FEATURES.filter((f) => f.status === 'roadmap').flatMap(
      (f) => f.chains,
    )
    for (const chain of roadmapChains) {
      expect(GAS_FREE_START_SENTENCE).not.toContain(chain.name)
    }
  })

  it('names the chains whose rail EXISTS, and no chain whose rail does not', () => {
    // This used to name native-seed and feeCurrency unconditionally. When the
    // gas-grant rail was marked unbuilt (its EVM half does not exist), that
    // made the test demand a sentence promising gas-free starts on chains
    // where nothing seeds anything — the test asserting the bug, again.
    for (const policy of ['native-seed', 'feeCurrency'] as const) {
      const card = featureFor(policy)
      const shipped = card !== null && card.status !== 'roadmap'
      for (const chain of chainsByGasPolicy(policy)) {
        if (shipped) expect(GAS_FREE_START_SENTENCE).toContain(chain.name)
        else expect(GAS_FREE_START_SENTENCE).not.toContain(chain.name)
      }
    }
  })

  it('still promises something — the sentence has not quietly emptied out', () => {
    // Guards the guard above: if every rail became roadmap the assertions
    // would all take the `not.toContain` branch and pass while the FAQ
    // rendered nothing at all.
    expect(GAS_FREE_START_SENTENCE).not.toBe('')
    expect(GAS_FREE_START_SENTENCE).toContain('gas money to start')
  })

  it('reads as a finished sentence', () => {
    expect(GAS_FREE_START_SENTENCE).toMatch(/\.$/)
    expect(GAS_FREE_START_SENTENCE).not.toContain('undefined')
  })
})
