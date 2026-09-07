'use client'

/**
 * Account health (#60): four cells, each a link to the settings surface that
 * owns the fact, each fed by a read that already ships:
 *   - payout accounts    BankAccountSummary[]  → country + verified
 *   - token approvals    a LINK only — allowances are RPC reads per EVM chain,
 *                        owned by the settings page; nothing to summarise here
 *   - sign-in methods    the account's identity kinds + its linked wallets
 *   - standing           MyStandingResponse    → limited / completion rate
 *
 * A read that has not answered is `null`, and its cell shows the pending
 * mark rather than a claim: `identities` is empty for EVERY account until
 * the methods read lands, so a cell keyed on the list alone told each
 * email or phone reader to "add a sign-in method" — with the warning dot —
 * until then, and for good when the read failed.
 */
import Link from 'next/link'
import type { BankAccountSummary, IdentityMethodWire, MyStandingResponse } from '@tenda/shared'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { cn } from '@/lib/cn'
import { HOME_COPY } from './copy'

export const HEALTH_HREF = {
  payouts: '/settings/bank-accounts',
  approvals: '/settings/token-approvals',
  signIn: '/settings/security',
  standing: '/profile',
} as const

/** The identity vocabulary as people read it. One place, keyed by the enum. */
const IDENTITY_KIND_LABEL: Record<IdentityMethodWire['kind'], string> = {
  phone: 'Phone',
  email: 'Email',
  google: 'Google',
  apple: 'Apple',
}

type Dot = 'good' | 'warn' | null

function Cell({ href, label, value, dot }: { href: string; label: string; value: string; dot: Dot }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1.5 border-r border-border-subtle px-4 py-3.5 last:border-r-0 hover:bg-surface-card max-sm:[&:nth-child(2n)]:border-r-0"
    >
      <Eyebrow as="span">{label}</Eyebrow>
      <span className="flex items-center gap-2 text-sm font-semibold leading-5 text-content-primary">
        {dot !== null && (
          <span
            aria-hidden
            className={cn('size-[7px] shrink-0 rounded-full', dot === 'good' ? 'bg-feedback-success-base' : 'bg-feedback-warning-base')}
          />
        )}
        <span className="truncate">{value}</span>
      </span>
    </Link>
  )
}

export function AccountHealthStrip({
  accounts,
  identities,
  walletCount,
  standing,
}: {
  /** null while the first load is pending. */
  accounts: BankAccountSummary[] | null
  /** null until the methods read has answered. */
  identities: readonly IdentityMethodWire[] | null
  walletCount: number
  standing: MyStandingResponse | null
}) {
  const verified = (accounts ?? []).filter((a) => a.verified)
  const countries = [...new Set(verified.map((a) => a.country.toUpperCase()))]
  const kinds =
    identities === null
      ? null
      : [...new Set(identities.filter((i) => i.verified).map((i) => IDENTITY_KIND_LABEL[i.kind]))]
  const signIn =
    kinds === null
      ? HOME_COPY.health.pending
      : kinds.length === 0 && walletCount === 0
        ? HOME_COPY.health.signInEmpty
        : HOME_COPY.health.signInValue(kinds, walletCount)

  let standingValue = ''
  let standingDot: Dot = null
  if (standing !== null) {
    if (standing.is_limited) {
      standingValue = HOME_COPY.health.standingLimited
      standingDot = 'warn'
    } else if (standing.completion_rate === null) {
      standingValue = HOME_COPY.health.standingNew
    } else {
      standingValue = `${HOME_COPY.health.standingGood} · ${HOME_COPY.health.completion(standing.completion_rate)}`
      standingDot = 'good'
    }
  }

  return (
    <nav
      aria-label="Account health"
      className="mt-5 grid grid-cols-2 overflow-hidden rounded-md border border-border-default sm:grid-cols-4"
    >
      <Cell
        href={HEALTH_HREF.payouts}
        label={HOME_COPY.health.payouts}
        value={accounts === null ? HOME_COPY.health.pending : HOME_COPY.health.payoutsValue(verified.length, countries)}
        dot={accounts === null ? null : verified.length > 0 ? 'good' : 'warn'}
      />
      <Cell href={HEALTH_HREF.approvals} label={HOME_COPY.health.approvals} value={`${HOME_COPY.health.approvalsValue} →`} dot={null} />
      <Cell
        href={HEALTH_HREF.signIn}
        label={HOME_COPY.health.signIn}
        value={signIn}
        dot={kinds === null ? null : kinds.length + walletCount > 0 ? 'good' : 'warn'}
      />
      <Cell href={HEALTH_HREF.standing} label={HOME_COPY.health.standing} value={standingValue === '' ? HOME_COPY.health.pending : standingValue} dot={standingDot} />
    </nav>
  )
}
