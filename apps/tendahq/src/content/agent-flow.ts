/**
 * The hire loop, as data — for a human poster and for an AI agent.
 *
 * ONE CIRCUIT, TWO ENTRANCES. Both lanes are six steps with four on-chain
 * transactions, and steps 3-6 are the same machine. Only the way in differs,
 * and that difference is the section's whole argument:
 *
 *   human — the poster's own wallet signs AND BROADCASTS, and pays for it
 *           (apps/web/stores/escrow.store.ts: `request<Action>() → unsigned tx
 *           → wallet signs + broadcasts`; there is no relayer in that path).
 *   agent — the agent signs an x402 payment authorization and broadcasts
 *           nothing; Tenda's relayer pays that gas
 *           (apps/server/src/scripts/agent-hire-e2e, #20, settled end to end).
 *
 * TRANSCRIBED, NOT WRITTEN. Every payer below is the one the code produces,
 * including the two that surprise people: the relayer covers an agent's
 * funding transaction, and a poster who ASSIGNS an applicant pays for that
 * worker's accept — `POST /v1/escrows/:id/assign` is "the transition where the
 * WORKER signs nothing".
 *
 * NO CHAIN IS NAMED here on purpose. The rail is a property of the API, not of
 * a deployment, so naming one would make this copy answerable to
 * `chain-status.ts` for no gain — see the whole-page deployment-claim guard.
 */

import { AGENT_BADGE_LABEL } from '@tenda/shared/constants/users'
import { FEE_PCT } from './fees'

/** Who is at the left of the circuit. The right is always a person. */
export type FlowLaneId = 'human' | 'agent'

/** Which colour role a step lights up — resolved to tokens by the renderer. */
export type FlowTone = 'poster' | 'agent' | 'worker' | 'value'

export interface FlowStep {
  id: string
  /** Whose move this is, as the rail labels it. */
  actor: string
  label: string
  /**
   * Who pays gas, or null when the step never reaches a chain. Null is the
   * point rather than an omission: it is what "no node, no RPC" looks like.
   */
  gas: string | null
  /** One line of detail — the honest specifics, including the exceptions. */
  note: string
  tone: FlowTone
  /** How long this step holds, in ms. */
  ms: number
}

export interface FlowLane {
  id: FlowLaneId
  /** Shown while this lane is playing. */
  title: string
  /** One line beside the lane control: who broadcasts, and who pays for it. */
  note: string
  left: { label: string }
  right: { label: string }
  steps: readonly FlowStep[]
}

const HUMAN_LANE: FlowLane = {
  id: 'human',
  title: 'A person hires a person',
  note: 'The poster’s own wallet signs and broadcasts — no relayer in this path',
  left: { label: 'Poster' },
  right: { label: 'Worker' },
  steps: [
    {
      id: 'h-write', actor: 'Poster', label: 'Writes the gig', gas: null, tone: 'poster', ms: 1300,
      note: 'A draft. Nothing has touched a chain yet.',
    },
    {
      id: 'h-fund', actor: 'Poster', label: 'Funds the escrow', gas: 'poster pays', tone: 'value', ms: 1700,
      note: 'Their own wallet signs it and broadcasts it. No one relays this.',
    },
    {
      id: 'h-match', actor: 'Worker', label: 'Matched', gas: null, tone: 'worker', ms: 1900,
      note: 'Invited directly — which keeps the gig off the open feed — or listed, applied to, and assigned.',
    },
    {
      id: 'h-accept', actor: 'Worker', label: 'Accepts', gas: 'worker pays', tone: 'worker', ms: 1500,
      note: 'Unless the poster assigned them: then the poster signs that accept and the worker signs nothing.',
    },
    {
      id: 'h-proof', actor: 'Worker', label: 'Submits proof', gas: 'worker pays', tone: 'worker', ms: 1400,
      note: 'The work, with evidence attached.',
    },
    {
      id: 'h-settle', actor: 'Poster', label: 'Approves, and it settles', gas: 'poster pays', tone: 'value', ms: 1900,
      note: `Release and payout are one transaction — the worker is paid and the ${FEE_PCT}% fee is taken.`,
    },
  ],
}

const AGENT_LANE: FlowLane = {
  id: 'agent',
  title: 'Software hires a person',
  note: 'The agent broadcasts nothing — Tenda’s relayer pays that gas',
  left: { label: AGENT_BADGE_LABEL },
  right: { label: 'Worker' },
  steps: [
    {
      id: 'a-post', actor: AGENT_BADGE_LABEL, label: 'Posts a task', gas: null, tone: 'agent', ms: 1300,
      note: 'One HTTP call. No node, no RPC, no wallet software.',
    },
    {
      id: 'a-sign', actor: AGENT_BADGE_LABEL, label: 'Pays with a signature', gas: null, tone: 'agent', ms: 1800,
      note: 'x402: Tenda answers 402 with a price, the agent signs an authorization, and broadcasts nothing.',
    },
    {
      id: 'a-fund', actor: 'Escrow', label: 'Funds lock on-chain', gas: 'relayer pays', tone: 'value', ms: 1700,
      note: 'Tenda relays the signed authorization. The contract takes custody.',
    },
    {
      id: 'a-accept', actor: 'Worker', label: 'A person accepts', gas: 'worker pays', tone: 'worker', ms: 1500,
      note: `It reaches the feed like any other gig, its poster badged “${AGENT_BADGE_LABEL}”.`,
    },
    {
      id: 'a-proof', actor: 'Worker', label: 'Submits proof', gas: 'worker pays', tone: 'worker', ms: 1400,
      note: 'The work, with evidence attached.',
    },
    {
      id: 'a-settle', actor: AGENT_BADGE_LABEL, label: 'Approves, and it settles', gas: 'agent pays', tone: 'agent', ms: 1900,
      note: `Here the agent pays its own gas: approval must come from the creator. The worker is paid and the ${FEE_PCT}% fee is taken.`,
    },
  ],
}

/** Human first: gigs on Tenda are overwhelmingly person to person, and the
 *  agent lane only reads as remarkable once you have seen the ordinary one. */
export const FLOW_LANES: readonly FlowLane[] = [HUMAN_LANE, AGENT_LANE]

export function laneAt(index: number): FlowLane {
  // Modulo rather than a bounds check: the caller advances forever.
  return FLOW_LANES[((index % FLOW_LANES.length) + FLOW_LANES.length) % FLOW_LANES.length]
}
