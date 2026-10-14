/**
 * Every string the /home dashboard shows (#60). Product facts and pitch
 * strings stay in shared `APP_INFO`; these are the dashboard's own labels.
 */
import { FEED_COPY } from '@/components/gig/feed/copy'

/** The head's trade action and the quick link say the same thing — one label. */
const TRADE_LABEL = 'Buy / sell USDC'
/** One retry label for every read the dashboard can ask again. */
const RETRY = 'Try again'

export const HOME_COPY = {
  greeting: {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
  },
  actions: {
    trade: TRADE_LABEL,
    /** The same words as the landing's hero — one label, one source. */
    post: FEED_COPY.cta.post,
  },
  announcement: {
    label: 'Announcement',
    read: 'Read',
  },
  attention: {
    label: 'Needs your attention',
    approve: (title: string) => `Approve the proof on “${title}”`,
    approveHint: 'Approve it, or the window releases the escrow for you',
    awaiting: (title: string) => `Your proof on “${title}” is awaiting approval`,
    awaitingHint: 'The poster is reviewing what you submitted',
    applications: (title: string) => `Applications are open on “${title}”`,
    applicationsHint: 'Pick a worker to assign the escrow',
    trade: 'A trade is waiting on your bank transfer',
    tradeHint: 'Send the fiat, then mark it paid on the trade',
    posted: 'Posted',
    acceptingUntil: 'accepting until',
  },
  figures: {
    posted: 'Posted',
    active: 'Active',
    completed: 'Completed',
    score: 'Review score',
    reviews: (count: number) => `/ ${count} ${count === 1 ? 'review' : 'reviews'}`,
    unrated: '—',
    unavailable: 'Counts unavailable',
    retry: RETRY,
  },
  myGigs: {
    title: 'My gigs',
    recent: 'recent',
    all: 'All my gigs',
    drafts: 'Drafts',
    empty: 'Nothing here yet.',
  },
  trades: {
    title: 'Active trades',
    inFlight: (count: number) => `${count} in flight`,
    more: 'Trade',
    empty: 'No trades in flight.',
    side: { selling: 'Your offer', buying: 'You are paying' },
  },
  wallet: {
    title: 'Wallet',
    linked: (count: number) => `${count} ${count === 1 ? 'wallet' : 'wallets'} linked`,
    open: 'Open wallet',
    across: (chains: number) => `USDC across ${chains} ${chains === 1 ? 'chain' : 'chains'}`,
    earned: 'Earned',
    spent: 'Spent',
    primary: 'primary',
    linkHint: 'Link another wallet for Solana or an EVM chain.',
    linkFirst: 'Link a wallet to see balances and take gigs.',
    link: 'Link a wallet',
    unavailable: 'Balances are unavailable right now.',
    /** The wallet LIST could not be read — not "no wallet", not a zero. */
    walletsError: 'Your wallets could not be read.',
    retry: RETRY,
  },
  notifications: {
    title: 'Notifications',
    unread: (count: number) => `${count} unread`,
    all: 'All',
    empty: 'Nothing new.',
  },
  messages: {
    title: 'Messages',
    unread: (count: number) => `${count} unread`,
    inbox: 'Inbox',
    empty: 'No conversations yet.',
  },
  health: {
    /** A cell whose read has not answered yet. */
    pending: '…',
    payouts: 'Payout accounts',
    payoutsValue: (verified: number, countries: string[]) =>
      verified === 0 ? 'None verified' : `${verified} verified · ${countries.join(', ')}`,
    approvals: 'Token approvals',
    approvalsValue: 'Manage allowances',
    signIn: 'Sign-in methods',
    signInValue: (kinds: string[], wallets: number) =>
      [...kinds, wallets === 0 ? null : `${wallets} ${wallets === 1 ? 'wallet' : 'wallets'}`]
        .filter((part): part is string => part !== null)
        .join(' · '),
    signInEmpty: 'Add a sign-in method',
    standing: 'Standing',
    standingGood: 'Good',
    standingLimited: 'Limited',
    standingNew: 'New account',
    completion: (rate: number) => `${Math.round(rate * 100)}% completion`,
  },
  quick: {
    post: { title: FEED_COPY.cta.post, hint: 'Money locks when you post' },
    trade: { title: TRADE_LABEL, hint: (markets: number) => `P2P · ${markets} fiat ${markets === 1 ? 'market' : 'markets'}` },
    disputes: { title: 'Disputes', none: 'None open', open: (count: number) => `${count} open` },
    profile: {
      title: 'Your profile',
      /** `reviews` is null until the count has answered — a score with "0 reviews" is a contradiction. */
      hint: (score: string | null, reviews: number | null) =>
        score === null
          ? 'Add a photo and a bio'
          : [score, reviews === null ? null : `${reviews} ${reviews === 1 ? 'review' : 'reviews'}`, 'edit']
              .filter((part): part is string => part !== null)
              .join(' · '),
    },
  },
} as const
