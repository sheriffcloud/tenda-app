/**
 * §04 How escrow works — copy + structure lifted from
 * Tenda V2/landing/sections/04-how-escrow-works.html.
 *
 * One unified four-stage contract (not a Gig⇄Exchange toggle — the contract is
 * the same on both sides). Followed by a Fallback subsection that documents
 * the four exit routes + a code clause from the on-chain program.
 *
 * Aspirational facts that need verification before launch (audit firm + date,
 * full program id) are flagged via Placeholder issue ids.
 */

export type StageAccent = 'brand' | 'accent' | 'success' | 'content'

export interface EventRow {
  label: string
  value: string
  /** Visual hint: hash → mono small/dim, status → tone-tinted pill, amt → bold mono. */
  kind: 'plain' | 'status' | 'hash' | 'amt'
  /** Required when kind === 'status'. */
  statusTone?: 'locked' | 'in-progress' | 'released' | 'final'
}

export interface Stage {
  num: string
  accent: StageAccent
  tag: string
  name: string
  body: string
  event: { rows: readonly EventRow[] }
}

export const ESCROW_HEADER = {
  eyebrow: { num: '§ 04', label: 'How escrow works' },
  h2: {
    line1: 'Funds lock first.',
    dim: 'Proof releases them.',
    accent: 'Nothing in between.',
  },
  sub: 'Every gig and every trade follows the same four-stage on-chain contract — on whichever chain you choose. No platform-held balance. No "pending" you can\'t see. Every state change is a transaction you can verify in a block explorer.',
  meta: [
    { k: 'Chains',  v: 'fromAppInfo:networksLine' },
    { k: 'Release', v: 'fromAppInfo:stage' },
    { k: 'Audit',   v: 'Pre-mainnet · audit pending' },
  ],
} as const

export const STAGES: readonly Stage[] = [
  {
    num: '01',
    accent: 'brand',
    tag: 'Poster · Seller',
    name: 'Lock',
    body: "The funds — USDC, SOL or ETH — leave the poster's (or seller's) wallet and enter the on-chain escrow contract. They are no longer in either party's control.",
    event: {
      rows: [
        { label: 'Event',  value: 'Locked',     kind: 'status', statusTone: 'locked' },
        { label: 'Amount', value: '12 USDC',    kind: 'amt' },
        { label: 'Tx',     value: '5Qf…aL2',    kind: 'hash' },
      ],
    },
  },
  {
    num: '02',
    accent: 'accent',
    tag: 'Worker · Buyer',
    name: 'Work',
    body: 'The worker (or buyer) accepts and delivers — package dropped, photo taken, fiat sent. Photo or video proof is uploaded.',
    event: {
      rows: [
        { label: 'Event', value: 'Proof submitted', kind: 'status', statusTone: 'in-progress' },
        { label: 'Proof', value: 'photo · 2 files', kind: 'plain' },
        { label: 'CID',   value: 'bafy…q9w',         kind: 'hash' },
      ],
    },
  },
  {
    num: '03',
    accent: 'brand',
    tag: 'Poster · Seller',
    name: 'Approve',
    body: 'The poster (or seller) reviews proof and signs an approval. One tap. No back-office. No phone calls.',
    event: {
      rows: [
        { label: 'Event',  value: 'Approved',  kind: 'status', statusTone: 'released' },
        { label: 'Signer', value: '@yemi.sol', kind: 'plain' },
        { label: 'Tx',     value: '9Tk…rNx',   kind: 'hash' },
      ],
    },
  },
  {
    num: '04',
    accent: 'content',
    tag: 'Program · Atomic',
    name: 'Release',
    body: 'In the same transaction, the contract splits the locked funds — payout to the worker (or buyer), fee to Tenda. Settlement in seconds on every chain.',
    event: {
      rows: [
        { label: 'Event',   value: 'Settled',         kind: 'status', statusTone: 'final' },
        { label: 'Payout',  value: '11.70 USDC',      kind: 'amt' },
        { label: 'Fee',     value: '0.30 USDC · 2.5%', kind: 'plain' },
      ],
    },
  },
] as const

export interface FallbackRoute {
  letter: 'A' | 'B' | 'C' | 'D'
  prefix: string
  body: string
  time: string
  /** Marks routes that aren't yet implemented in the on-chain program (tracked
   *  in open_issues.md). UI shows a "planned" pill and dims the row. */
  aspirational?: true
}

export const FALLBACK = {
  tag: 'Fallback · when things go wrong',
  h3: "If proof is missing or contested, escrow resolves — it doesn't disappear.",
  body: 'Funds are never stuck on Tenda. Every gig has a deterministic exit — initiated by a party, by a deadline, or by Tenda mediation. Whichever path triggers, both sides see the same on-chain receipt.',
  routes: [
    { letter: 'A', prefix: 'Cancel.',        body: 'Poster (or seller) cancels before a worker (or buyer) accepts → the funds return to the locker.',        time: 'pre-accept' },
    { letter: 'B', prefix: 'Auto-approve.',  body: "If the poster (or seller) doesn't approve or dispute within the review window, the funds auto-release to the worker (or buyer).",
      time: '48h', aspirational: true },
    { letter: 'C', prefix: 'Reclaim.',       body: 'Worker (or buyer) misses the proof-submission deadline → poster (or seller) can claim the refund.', time: 'post-deadline' },
    { letter: 'D', prefix: 'Dispute.',       body: 'Either side opens a dispute after proof is submitted → Tenda mediation reviews evidence and instructs the program to release or refund.', time: '≤ 24h' },
  ] satisfies readonly FallbackRoute[],
} as const
