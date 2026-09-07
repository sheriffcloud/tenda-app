/**
 * §01 header copy. The SEQUENCE lives in content/agent-flow.ts — it is the
 * section's subject, and a replacement diagram must not have to restate it.
 *
 * The heading carries the contrast in words, because the two lanes take about
 * eighteen seconds to both play and a visitor who sees only one must still get
 * the point. It claims a capability, not a deployment, and names no chain — so
 * it stays true before and after mainnet, and clear of the whole-page
 * deployment-claim guard.
 */

import { GIG_ASSET_SYMBOL } from '@/content'
import { FLOW_LANES } from '@/content/agent-flow'
import { numberWord } from '@/lib/number-words'

/**
 * Labels for the custody visual: the vault's three states, and the asset its
 * amounts are denominated in.
 *
 * The symbol comes from `GIG_ASSET_SYMBOL`, which content/fees.ts derives from
 * the same asset whose decimals scale the figures printed next to it.
 */
export const CUSTODY_LABELS = {
  idle: 'Escrow',
  holding: 'Escrow · holding',
  released: 'Escrow · released',
  asset: GIG_ASSET_SYMBOL,
} as const

/** How many steps of the first lane reach a chain — the rule's aside. */
const ON_CHAIN_STEPS = FLOW_LANES[0].steps.filter((s) => s.gas !== null).length

export const AGENT_FLOW_HEADER = {
  eyebrow: 'The hire loop',
  /** "Four on-chain transactions" — counted off the lane, not typed. */
  aside: `${numberWord(ON_CHAIN_STEPS, true)} on-chain transactions`,
  h2: ['A person hires a person', 'Or software does'],
  sub: 'Same escrow, same proof, same payout — the only thing that changes is who walks in the door, and who pays to get through it. Watch the money: it never sits with us.',
} as const

/**
 * What a step with no gas payer says.
 *
 * A constant, not a string typed in the renderer: `rendered.test.tsx` asserts
 * the section states a payer for EVERY step including the ones that reach no
 * chain, and that guard is only worth having if it and the component read the
 * same word.
 */
export const NO_GAS_LABEL = 'no transaction'

/** Heading for the plain-text sequence assistive tech reads. */
export const AGENT_FLOW_STEPS_LABEL = 'How a job runs, step by step'

/** Said next to the lane buttons, so the control explains itself. */
export const LANE_PIN_HINT = {
  cycling: 'both play in turn · pick one to hold it',
  pinned: 'holding · pick it again to resume',
} as const

/** The play/pause control's accessible names. */
export const PLAY_LABELS = { pause: 'Pause the sequence', play: 'Play the sequence' } as const

/** The lane control's accessible name. */
export const LANE_GROUP_LABEL = 'Choose a lane'
