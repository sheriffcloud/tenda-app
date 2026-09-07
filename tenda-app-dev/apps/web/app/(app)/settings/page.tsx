'use client'

/**
 * Settings index (comp: Settings & Profile). Cards for the surfaces money and
 * identity move through, then the preferences that are actually persisted,
 * then sign-out.
 *
 * The sub-pages the comp does not draw — bank-accounts, linked-wallets,
 * security, token-approvals — all ship and all stay: mobile wins on which
 * surfaces exist. Support and the build line are kept for the same reason.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CircleHelp } from 'lucide-react'
import { APP_INFO } from '@tenda/shared'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth.store'
import { Toggle } from '@/components/ui/Toggle'
import { showToast } from '@/components/ui/Toast'
import { SignOutButton } from '@/components/profile'
import { SettingsCardGrid } from '@/components/settings/SettingsCardGrid'
import { SETTINGS_COPY, linkedWalletsBadge } from '@/components/settings/copy'
import { getEnv } from '@/lib/config/env'

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const wallets = useAuthStore((s) => s.wallets)
  const walletsStatus = useAuthStore((s) => s.walletsStatus)
  const ensureWallets = useAuthStore((s) => s.ensureWallets)
  const refreshUser = useAuthStore((s) => s.refreshUser)
  const [savingAdvanced, setSavingAdvanced] = useState(false)

  // The badge is only honest once the wallets have actually been read.
  useEffect(() => {
    void ensureWallets()
  }, [ensureWallets])

  async function toggleAdvanced(next: boolean) {
    if (savingAdvanced) return
    setSavingAdvanced(true)
    try {
      await api.users.updateMe({ advanced_mode_enabled: next })
      await refreshUser()
      showToast('success', next ? SETTINGS_COPY.advanced.on : SETTINGS_COPY.advanced.off)
    } catch {
      showToast('error', SETTINGS_COPY.advanced.failed)
    } finally {
      setSavingAdvanced(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header>
        <h1 className="type-h1 text-content-primary">
          {SETTINGS_COPY.title}
        </h1>
        <p className="mt-2 max-w-[62ch] type-body text-content-secondary">
          {SETTINGS_COPY.lead}
        </p>
      </header>

      <SettingsCardGrid
        badges={{
          '/settings/linked-wallets': linkedWalletsBadge(wallets.length, walletsStatus === 'ready'),
        }}
      />

      <section>
        <h2 className="mb-4 type-h2 text-content-primary">
          {SETTINGS_COPY.preferences}
        </h2>
        <div className="flex items-center gap-4 rounded-card border border-border-default bg-surface-card px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-content-primary">
              {SETTINGS_COPY.advanced.label}
            </p>
            <p className="mt-0.5 text-xs text-content-secondary">{SETTINGS_COPY.advanced.hint}</p>
          </div>
          <Toggle
            value={user?.advanced_mode_enabled ?? false}
            onChange={(next) => void toggleAdvanced(next)}
            disabled={savingAdvanced}
            label={SETTINGS_COPY.advanced.label}
          />
        </div>
      </section>

      <div className="flex flex-col gap-3">
        <Link
          href="/support"
          className="flex items-center gap-3 rounded-card border border-border-default bg-surface-card px-4 py-3 text-sm font-semibold text-content-primary transition-colors hover:bg-surface-inset"
        >
          <CircleHelp size={16} aria-hidden /> Help &amp; guide
        </Link>
        <SignOutButton />
      </div>

      <p className="text-center text-xs text-content-tertiary">
        {APP_INFO.name} {SETTINGS_COPY.build(getEnv())}
      </p>
    </div>
  )
}
