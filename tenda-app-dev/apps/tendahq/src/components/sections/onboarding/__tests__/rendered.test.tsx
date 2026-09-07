import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { chainStatus, FEATURE_STATUS_DISPLAY, ONBOARDING_FEATURES } from '@/content'
import { Onboarding } from '../Onboarding'

/**
 * The section is a selector rail over ONE panel, so the static markup carries
 * every rail's TAB but only the default rail's prose — these assertions pin
 * exactly that contract (its interaction is a useState swap the static render
 * cannot exercise; what it CAN prove is that the rail is complete, the
 * default is the first rail, and the tablist wiring is real).
 */
describe('onboarding rendered', () => {
  const html = renderToStaticMarkup(createElement(Onboarding, { surface: 'alt' }))

  it('renders a tab for every rail, in content order', () => {
    for (const feature of ONBOARDING_FEATURES) {
      expect(html).toContain(`onboarding-tab-${feature.id}`)
      expect(html).toContain(feature.tab)
    }
    const tabPositions = ONBOARDING_FEATURES.map((f) => html.indexOf(`onboarding-tab-${f.id}`))
    expect([...tabPositions].sort((a, b) => a - b)).toEqual(tabPositions)
  })

  it('shows the FIRST rail in the panel by default, and only that rail', () => {
    const first = ONBOARDING_FEATURES[0]
    expect(html).toContain(first.title)
    expect(html).toContain(first.body)
    expect(html).toContain(first.fact)
    for (const other of ONBOARDING_FEATURES.slice(1)) {
      expect(html).not.toContain(other.body)
    }
  })

  it('wires the tablist: one panel, one selected tab, labelled by it', () => {
    expect(html.match(/role="tabpanel"/g)).toHaveLength(1)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html).toContain(`aria-labelledby="onboarding-tab-${ONBOARDING_FEATURES[0].id}"`)
    expect(html.match(/role="tab"/g)).toHaveLength(ONBOARDING_FEATURES.length)
  })

  /**
   * The tab dot marks anything that is not reachable today. Its title is the
   * card's own status label rather than a fixed "On the roadmap", because the
   * two are no longer the same thing: a 'testnet' rail is built and working,
   * just not on a chain a visitor can use.
   */
  it('marks every not-live rail on its tab, and none of the live ones', () => {
    const notLive = ONBOARDING_FEATURES.filter((f) => f.status !== 'live')
    expect(notLive.length).toBeGreaterThan(0)
    const dots = html.match(/title="(Testnet|Roadmap)"/g) ?? []
    expect(dots).toHaveLength(notLive.length)
    expect(html).not.toContain('title="On the roadmap"')
  })

  /**
   * Scoped to CHAIN-BACKED cards on purpose.
   *
   * A card that names chains is making a claim about those chains, so its
   * status must follow their deployment — that is the defect: two of them
   * rendered a pulsing Live pill while naming only chains with no contract.
   *
   * A chainless card is making a different claim. "Bring the wallet you already
   * have" is about Mobile Wallet Adapter and WalletConnect, which work today
   * and work identically after mainnet; deferring it to chain status would mark
   * a shipped capability pending and then "promote" it on launch day having
   * changed nothing. The rule is that a claim defers to what it depends on, not
   * that everything defers to chains.
   */
  it('never claims Live for a rail whose chains are all undeployed', () => {
    // An IMPLICATION, not a biconditional. The reverse direction — "a live
    // chain makes the card live" — was wrong: an UNBUILT rail is roadmap
    // however live its chains are, which is exactly the gas-grant card's
    // state while the EVM seed does not exist. Stating it as an equivalence
    // made a correct card fail.
    const chainBacked = ONBOARDING_FEATURES.filter((f) => f.chains.length > 0)
    expect(chainBacked.length).toBeGreaterThan(0)
    for (const feature of chainBacked) {
      if (feature.status !== 'live') continue
      expect(feature.chains.some((chain) => chainStatus(chain) === 'live')).toBe(true)
    }
  })

  it('has not gone all-roadmap — something on the rail still ships', () => {
    // Guards the implication above, which an entirely roadmap section would
    // satisfy vacuously.
    expect(ONBOARDING_FEATURES.some((f) => f.status !== 'roadmap')).toBe(true)
  })

  it('does not downgrade a capability that never depended on a chain', () => {
    // The wallet card. It survives the mainnet cutover unchanged, so a status
    // that moves with chain deployment would be describing the wrong thing.
    const wallet = ONBOARDING_FEATURES.find((f) => f.id === 'any-wallet')
    expect(wallet).toBeDefined()
    expect(wallet?.chains).toHaveLength(0)
    expect(wallet?.status).toBe('live')
  })

  it('shows a Testnet pill for a built rail nobody can reach on mainnet yet', () => {
    // Not Roadmap: both gas rails are built and verified on-chain, and calling
    // them unbuilt is the opposite error to calling them live.
    const testnetCards = ONBOARDING_FEATURES.filter((f) => f.status === 'testnet')
    expect(testnetCards.length).toBeGreaterThan(0)
    expect(html).toContain(FEATURE_STATUS_DISPLAY.testnet.label)
  })
})
