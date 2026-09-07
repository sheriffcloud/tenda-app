/**
 * Which chains Tenda's escrow is actually DEPLOYED on, and how the landing says so.
 *
 * WHY THIS EXISTS. Every chain claim on this site used to derive from
 * `entry.kind === 'mainnet'` — a fact about the CHAIN, read as a fact about
 * TENDA. The site therefore advertised "4 · live", "Settlement runs on these
 * chains" and four copyable mainnet chain ids while the confirmed deployments
 * were all on testnet: 0G mainnet was unbuilt, Base and Solana mainnet had no
 * artifact at all, and Celo mainnet had three simulated `forge script` runs
 * with a null tx hash and no receipt. The manifest now declares `status` per
 * entry, and this module is the only place the landing reads it.
 *
 * SEPARATE FROM content/chains.ts on purpose. That file answers "which chains
 * does the landing talk about, and what are they called"; this one answers
 * "which of them can you use today". Keeping the second question here means a
 * surface has to ASK for deployment status rather than infer it from whatever
 * chain field happens to be nearby — which is the exact mistake above.
 */

import { CHAIN_MANIFEST, type ChainStatus } from '@tenda/shared/chains'
import { prose } from '@/lib/prose'
import { LANDING_CHAINS, type LandingChain } from './chains'

/**
 * The manifest's declared status per CAIP-2 id.
 *
 * A Map rather than an object literal: chain ids are external strings, and a
 * plain object would answer `'constructor'` with an inherited function — the
 * prototype-key trap this codebase has already been bitten by once (see
 * `transportFor`). A Map has no prototype keys to inherit.
 */
const STATUS_BY_CHAIN_ID: ReadonlyMap<string, ChainStatus> = new Map(
  CHAIN_MANIFEST.map((entry) => [entry.id, entry.status]),
)

/**
 * A landing chain's deployment status.
 *
 * Total by construction — every LANDING_CHAINS member is built from a manifest
 * entry, so the lookup always hits. The fallback exists because `Map.get` is
 * typed `| undefined` and a display function must return something; it is
 * 'planned' rather than 'live' because the two failure directions are not
 * symmetric. Treating a live chain as planned understates what ships and is
 * visibly wrong to us; treating an unknown chain as live is how this site came
 * to advertise four contracts that did not exist.
 */
export function chainStatus(chain: LandingChain): ChainStatus {
  return STATUS_BY_CHAIN_ID.get(chain.id) ?? 'planned'
}

/** The chains the landing shows that Tenda has actually deployed on. */
export const LIVE_CHAINS: readonly LandingChain[] = LANDING_CHAINS.filter(
  (chain) => chainStatus(chain) === 'live',
)

/** The chain (normally one) whose deploy is committed and next. */
export const LAUNCHING_CHAINS: readonly LandingChain[] = LANDING_CHAINS.filter(
  (chain) => chainStatus(chain) === 'launching',
)

/** Intended, unscheduled. No date, no commitment — and no launch claim. */
export const PLANNED_CHAINS: readonly LandingChain[] = LANDING_CHAINS.filter(
  (chain) => chainStatus(chain) === 'planned',
)

/**
 * Everything without a contract on it — launching and planned together.
 *
 * The bucket the whole-page deployment-claim guard iterates, because the rule
 * it enforces ("no deployment verb in front of this chain") is identical for
 * both: a committed deploy is still not a deploy.
 */
export const UNDEPLOYED_CHAINS: readonly LandingChain[] = LANDING_CHAINS.filter(
  (chain) => chainStatus(chain) !== 'live',
)

/**
 * How a status is presented. Keyed by the manifest's own ChainStatus, so a new
 * status value is a type error here rather than a chain that quietly renders
 * no badge.
 *
 * `planned` is labelled plainly and NOT softened to "coming soon". The reason
 * this field exists is that undeployed chains were being presented as live; a
 * euphemism is the same claim in a quieter voice. Tones are literal strings
 * resolved by the renderer, matching how features.ts names its icons — content
 * stays free of component imports.
 */
export const CHAIN_STATUS_DISPLAY: Record<
  ChainStatus,
  { label: string; tone: 'live' | 'brand' | 'neutral' }
> = {
  live: { label: 'Live', tone: 'live' },
  launching: { label: 'Launching', tone: 'brand' },
  planned: { label: 'Planned', tone: 'neutral' },
}

/**
 * One clause describing where mainnet settlement stands, true in every state
 * the manifest can reach.
 *
 * ONE source because the footer's legal disclaimer and the networks section
 * each made this claim independently, in different words, from a chain list
 * that asserted nothing about deployment. Two hand-kept statements of the same
 * fact is how the disclaimer — of all the text on the page — ended up being
 * the most confidently wrong. Every word of it moves with the manifest's
 * per-chain `status`; nothing in it is typed.
 */
export function mainnetStatusClause(
  live: readonly LandingChain[],
  launching: readonly LandingChain[],
  planned: readonly LandingChain[],
): string {
  // Assembled from parts rather than branched per combination. The earlier
  // version had one bucket for everything not live and produced "mainnet
  // launching on 0G, Solana, Base and Celo" — announcing four launches when
  // one chain was being deployed. A verb must cover only the chains it is true
  // of, which means each group carries its own.
  const names = (chains: readonly LandingChain[]) => prose(chains.map((chain) => chain.name))
  const parts: string[] = []
  if (live.length > 0) parts.push(`live on ${names(live)}`)
  if (launching.length > 0) parts.push(`launching on ${names(launching)}`)
  if (planned.length > 0) parts.push(`with ${names(planned)} to follow`)
  // Empty means the manifest lists no mainnet at all. '' lets a caller drop the
  // clause rather than render a dangling preposition — worse in a legal
  // disclaimer than a missing sentence.
  return parts.join(', ')
}

/**
 * The clause for the manifest as it stands.
 *
 * Built through the exported function above rather than inline, for the reason
 * features.ts exports `gasFreeSentence` and `featureFor`: three of these four
 * states are unreachable from the live manifest today, and the one that
 * matters most — the first mainnet going live — is the state that has never
 * run. A branch that cannot be exercised until the day it has to be right is
 * not covered by anything except a function you can call with arguments.
 */
export const MAINNET_STATUS_CLAUSE: string = mainnetStatusClause(
  LIVE_CHAINS,
  LAUNCHING_CHAINS,
  PLANNED_CHAINS,
)
