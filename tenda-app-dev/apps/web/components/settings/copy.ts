/**
 * Settings copy, in one place so the index and its cards cannot drift.
 *
 * The comp's Preferences block offers three notification toggles — push,
 * email and a weekly digest. NONE of them exist: there is no preference
 * column on the user, no endpoint that stores one, and the real notification
 * opt-ins are `gig_subscriptions` (per city/category) and `device_tokens`
 * (push registration). Shipping three switches that forget on reload would be
 * worse than not shipping them, so the section carries the one preference
 * that IS persisted — the P2P advanced mode. Logged in spec-corrections.md.
 */
export const SETTINGS_COPY = {
  title: 'Settings',
  lead: 'Sign-in methods, the wallets and bank accounts money moves through, and what you have approved on-chain.',
  preferences: 'Preferences',
  advanced: {
    label: 'P2P Exchange',
    // Honest since #50: the Trade surface is open to everyone (mobile parity,
    // server decision #14) — this stores a preference, it unlocks nothing.
    hint: 'A saved preference on your account. The Trade surface is open to everyone.',
    on: 'P2P Exchange turned on',
    off: 'P2P Exchange turned off',
    failed: 'Could not update the setting, please try again',
  },
  build: (env: string) => `web · ${env} build`,
} as const

export interface SettingsCard {
  href: string
  title: string
  blurb: string
  /** Only ever set from data already in hand — never a guess, never a zero. */
  badge?: string
}

/** `2 linked`, or nothing at all while the answer is still unknown. */
export function linkedWalletsBadge(count: number, ready: boolean): string | undefined {
  if (!ready) return undefined
  return count === 1 ? '1 linked' : `${count} linked`
}

/**
 * The comp badges four of these cards — active sessions, linked wallets, saved
 * banks, and approvals needing review. Only the wallet count is already in
 * hand (the auth store loads it app-wide); the rest would each cost a request
 * on an index page, and the approvals count needs per-chain on-chain reads.
 * A badge is added when its number is free and certain, and left off entirely
 * otherwise — an absent badge says nothing, while "0 saved" from a failed
 * fetch says something false. Logged in spec-corrections.md.
 */
export const SETTINGS_CARDS: readonly Omit<SettingsCard, 'badge'>[] = [
  {
    href: '/settings/security',
    title: 'Sign-in methods',
    blurb: 'Email, wallet and the devices you are signed in on.',
  },
  {
    href: '/settings/linked-wallets',
    title: 'Linked wallets',
    blurb: 'Which wallets can sign for this account, and which is primary.',
  },
  {
    href: '/settings/bank-accounts',
    title: 'Bank accounts',
    blurb: 'Payout methods available for your country and currency.',
  },
  {
    href: '/settings/token-approvals',
    title: 'Token approvals',
    blurb: 'ERC-20 allowances you have granted on-chain.',
  },
  {
    href: '/profile',
    title: 'Your profile',
    blurb: 'Name, photo and country. What other people see.',
  },
]
