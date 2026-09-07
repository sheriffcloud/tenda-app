'use client'

/**
 * Sign-in & security — web port of mobile's security screen: the linked
 * sign-in methods (GET /v1/auth/methods) with verification state, plus
 * the wallet count linking to its own management page. Adding an email or
 * phone rides mobile's link-mode auth flow, which web has not ported —
 * the affordance says so instead of dead-ending.
 */
import { useEffect } from 'react'
import Link from 'next/link'
import { BadgeCheck, Mail, Phone, Wallet } from 'lucide-react'
import type { IdentityMethodWire } from '@tenda/shared'
import { useAuthStore } from '@/stores/auth.store'

/** A kind='email' row, or the email an OAuth identity carried. */
function pickEmail(identities: IdentityMethodWire[]): { value: string; verified: boolean } | null {
  const withEmail = identities.filter(
    (i): i is IdentityMethodWire & { email: string } => i.email !== null && i.email !== '',
  )
  const chosen = withEmail.find((i) => i.verified) ?? withEmail[0]
  return chosen ? { value: chosen.email, verified: chosen.verified } : null
}

function pickPhone(identities: IdentityMethodWire[]): IdentityMethodWire | null {
  return identities.find((i) => i.kind === 'phone') ?? null
}

function Row({
  icon,
  label,
  value,
  verified,
}: {
  icon: React.ReactNode
  label: string
  value: string
  verified?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-card px-4 py-3">
      <span className="text-content-secondary">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-content-tertiary">{label}</p>
        <p className="truncate text-sm font-semibold text-content-primary">{value}</p>
      </div>
      {verified === true && (
        <BadgeCheck size={18} className="shrink-0 text-feedback-success-base" aria-label="Verified" />
      )}
    </div>
  )
}

export default function SecuritySettingsPage() {
  const identities = useAuthStore((s) => s.identities)
  const wallets = useAuthStore((s) => s.wallets)
  const loadMethods = useAuthStore((s) => s.loadMethods)

  useEffect(() => {
    void loadMethods()
  }, [loadMethods])

  const email = pickEmail(identities)
  const phone = pickPhone(identities)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <h1 className="px-1 pb-1 pt-6 font-display text-2xl font-bold text-content-primary">
        Sign-in &amp; security
      </h1>

      <Row
        icon={<Mail size={16} />}
        label="Email"
        value={email?.value ?? 'Not linked'}
        verified={email?.verified}
      />
      <Row
        icon={<Phone size={16} />}
        label="Phone"
        value={phone?.identifier ?? 'Not linked'}
        verified={phone?.verified}
      />
      <Link
        href="/settings/linked-wallets"
        className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-card px-4 py-3 transition-colors hover:bg-surface-inset"
      >
        <Wallet size={16} className="text-content-secondary" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-content-tertiary">Wallets</span>
          <span className="block text-sm font-semibold text-content-primary">
            {wallets.length} linked
          </span>
        </span>
        <span className="text-sm font-semibold text-brand-primary">Manage</span>
      </Link>

      <p className="px-1 text-xs text-content-tertiary">
        Linking a new email or phone number is available in the mobile app for now.
      </p>
    </div>
  )
}
