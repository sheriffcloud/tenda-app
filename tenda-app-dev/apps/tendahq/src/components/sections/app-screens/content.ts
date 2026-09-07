/**
 * §00 Inside the app — three screens, one contract.
 *
 * The section shows the product rather than describing it: the gig feed, the
 * escrow detail and the wallet, drawn in the app's own light tokens. Every
 * figure that has a source on this page takes it from there — the example
 * gigs from content/tasks.ts, the escrow from content/escrow-example.ts (the
 * same one the hero's receipt draws), the chain rows from the manifest-derived
 * LANDING_CHAINS — so the screens cannot show a number the rest of the page
 * contradicts.
 */

import {
  APPROVAL_WINDOW_HOURS,
  CURRENCIES,
  EXAMPLE_ESCROW,
  EXAMPLE_TASKS,
  GIG_ASSET_SYMBOL,
  LANDING_CHAINS,
  type ExampleTask,
} from '@/content'

export const APP_SCREENS_HEADER = {
  title: 'Inside the app',
  h2: ['Three screens', 'One contract'],
  lede: 'Every screen you will use is a view of the same escrow. A gig you can take, the money it holds, and the wallet it settles into — nothing in between.',
  facts: [
    { lead: 'Gigs', rest: 'post with the money already locked. Accepting one is a signature, not a promise.' },
    { lead: 'Escrow', rest: 'shows the four states the contract can be in, and which one you are in now.' },
    { lead: 'Wallet', rest: `is ${GIG_ASSET_SYMBOL} first, per chain, with the exchange one tap away.` },
  ],
  cta: { primary: 'Download for Android', secondary: 'See the hire loop' },
  /** The accessible name of the group of three screens. */
  screensLabel: 'Three app screens: gigs, escrow, wallet',
} as const

/** The caption under each screen, in screen order. */
export const SCREEN_CAPTIONS = [
  { k: 'Gigs', b: `Posted in local terms, paid in ${GIG_ASSET_SYMBOL}. A gig on the feed already has its money locked.` },
  { k: 'Escrow', b: 'Lock, work, approve, release. Four states, all on-chain, every one a transaction you can open.' },
  { k: 'Wallet', b: `${GIG_ASSET_SYMBOL} first, one row per chain. Sell it for cash on the exchange without leaving the app.` },
] as const

/** Chrome shared by the three screens. */
export const PHONE_CHROME = {
  clock: '9:41',
  signal: `${LANDING_CHAINS[0]?.name ?? ''} · 4G`,
  tabs: ['Gigs', 'Exchange', 'Wallet', 'You'],
} as const

const byId = (id: string): ExampleTask => {
  const task = EXAMPLE_TASKS.find((t) => t.id === id)
  if (task === undefined) throw new Error(`app screens: no example task ${id}`)
  return task
}

/** The gig feed: a funded delivery the reader could take, and one more below it. */
export const GIGS_SCREEN = {
  title: 'Gigs',
  segments: ['All', 'Nearby', 'Remote'],
  proof: 'proof: photo',
  lead: {
    task: byId('t-01'),
    poster: { initial: 'A', name: 'Adaeze', rating: '4.9' },
    state: 'Funded',
    action: 'Apply',
  },
  next: { task: byId('t-02') },
} as const

/**
 * Where each of the contract's stages stands on this screen, in the shared
 * example's stage order: the lock is done, the work is under way, approval
 * has its review window ahead of it, and the release waits on that.
 */
const STAGE_STANDING = [
  { when: '09:12', state: 'done' },
  { when: 'now', state: 'now' },
  { when: `${APPROVAL_WINDOW_HOURS}h`, state: 'todo' },
  { when: '—', state: 'todo' },
] as const

/** The escrow detail at the Work stage, with the split the contract will make. */
export const ESCROW_SCREEN = {
  title: 'Escrow',
  ...EXAMPLE_ESCROW,
  stages: EXAMPLE_ESCROW.stages.map((label, i) => {
    const standing = STAGE_STANDING[i]
    // A done stage shows its tick; every other stage shows its number.
    return { label, n: standing.state === 'done' ? '✓' : String(i + 1), ...standing }
  }),
  action: 'Submit proof',
} as const

/**
 * The wallet: USDC first, one row per chain. The per-chain split is example
 * data and sums to the headline; the chains themselves are the manifest's.
 *
 * THE LOCAL FIGURE IS ROUNDED TO TWO SIGNIFICANT FIGURES, the rule
 * content/trades.ts sets for every fiat amount on the page: a balance and its
 * local equivalent divide out to an exchange rate, and a precise-looking
 * number reads as one Tenda quotes. It does not; the seller sets the rate.
 */
const WALLET_SPLIT = ['20.00', '16.20', '8.00', '4.00'] as const

/** The example local-currency reading beside the balance. */
export const WALLET_APPROX = { currency: 'NGN', amount: 75_000 } as const

export const WALLET_SCREEN = {
  title: 'Wallet',
  amount: '48.20',
  unit: GIG_ASSET_SYMBOL,
  approx: `≈ ${CURRENCIES[WALLET_APPROX.currency].symbol} ${WALLET_APPROX.amount.toLocaleString('en-US')} · across ${LANDING_CHAINS.length} chains`,
  rows: LANDING_CHAINS.map((chain, i) => ({
    chain,
    amount: WALLET_SPLIT[i] ?? '0.00',
  })),
  action: 'Sell for cash',
} as const
