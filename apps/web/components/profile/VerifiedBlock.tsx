'use client'

/**
 * "Verified" (comp) — what this account has actually proved.
 *
 * Only rows the server has marked verified appear. An identity that is merely
 * ATTACHED is not a verification, and listing it under this heading would
 * turn an unproven address into a trust signal: `IdentityMethodWire.verified`
 * is the one field that decides, and wallets earn their row from
 * `verified_at`, not from being linked.
 *
 * Nothing verified renders nothing at all, rather than an empty panel headed
 * "Verified" — which reads as a claim about a user who has made none.
 */
import { BadgeCheck, KeyRound, Mail, Phone, Wallet, type LucideIcon } from 'lucide-react'
import type { IdentityMethodWire, LinkedWallet } from '@tenda/shared'
import { Eyebrow } from '@/components/ui/Eyebrow'

/**
 * What the row is a proof OF — carried, never inferred from the label.
 * Taken off the wire type itself, so a new identity kind is a compile error
 * in ROW_ICON below rather than a silently missing glyph.
 */
export type VerifiedRowIcon = IdentityMethodWire['kind'] | 'wallet'

export interface VerifiedRow {
  key: string
  label: string
  value: string
  icon: VerifiedRowIcon
}

/**
 * One glyph per credential kind. Keyed by the kind rather than by the display
 * string: matching on the label gave every non-wallet row an envelope, so a
 * verified phone or Google account was drawn as email.
 */
const ROW_ICON: Record<VerifiedRowIcon, LucideIcon> = {
  email: Mail,
  phone: Phone,
  google: KeyRound,
  apple: KeyRound,
  wallet: Wallet,
}

/** Verified identities first, then wallets — pure, so the rules are testable. */
export function buildVerifiedRows(
  identities: readonly IdentityMethodWire[],
  wallets: readonly LinkedWallet[],
): VerifiedRow[] {
  const rows: VerifiedRow[] = identities
    .filter((i) => i.verified)
    .map((i) => ({
      key: `identity:${i.kind}:${i.identifier}`,
      label: i.kind === 'email' ? 'Email' : i.kind,
      // The address when the credential carries one, and the number for a
      // phone — both are the human-readable half of that credential, on the
      // reader's OWN profile. An OAuth `sub` is an opaque id and says nothing.
      value: i.email ?? (i.kind === 'phone' ? i.identifier : 'Verified'),
      icon: i.kind,
    }))

  const verifiedWallets = wallets.filter((w) => w.verified_at !== null)
  if (verifiedWallets.length > 0) {
    rows.push({
      key: 'wallets',
      label: 'Wallet',
      value:
        verifiedWallets.length === 1
          ? '1 verified'
          : `${verifiedWallets.length} verified`,
      icon: 'wallet',
    })
  }
  return rows
}

export function VerifiedBlock({
  identities,
  wallets,
}: {
  identities: readonly IdentityMethodWire[]
  wallets: readonly LinkedWallet[]
}) {
  const rows = buildVerifiedRows(identities, wallets)
  if (rows.length === 0) return null

  return (
    <section>
      <Eyebrow as="h2" className="mb-3">
        Verified
      </Eyebrow>
      <dl className="rounded-card border border-border-default bg-surface-card px-4 py-1">
        {rows.map((row) => {
          const Icon = ROW_ICON[row.icon]
          return (
          <div
            key={row.key}
            className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-b-0"
          >
            <Icon size={15} aria-hidden className="shrink-0 text-content-tertiary" />
            <dt className="text-sm capitalize text-content-secondary">{row.label}</dt>
            <dd className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-content-primary">
              {row.value}
              <BadgeCheck size={15} aria-hidden className="text-feedback-success-base" />
            </dd>
          </div>
          )
        })}
      </dl>
    </section>
  )
}
