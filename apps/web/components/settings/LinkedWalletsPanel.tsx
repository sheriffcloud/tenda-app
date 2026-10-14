'use client'

/**
 * Settings → Linked wallets (web port of apps/mobile/app/settings/
 * linked-wallets.tsx). Add = the same nonce + signature dance as sign-in
 * against /v1/auth/link-wallet with forceFresh, so the user can pick a
 * DIFFERENT account than the one on their JWT. The server enforces the
 * primary/sole/in-use unlink guards — this screen just surfaces its answers.
 * No picker on web: AppKit's modal IS the multi-wallet picker.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CHAIN_NAMESPACE_LABEL,
  ApiClientError,
  ErrorCode,
  SUPPORT_TOPICS,
  SUPPORT_WALLET_INTRO,
  WalletError,
  truncateWallet,
  type LinkedWallet,
} from '@tenda/shared'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth.store'
import { reownAdapter } from '@/wallet/adapters/reown'
import { WEB_NO_WALLET_COPY } from '@/wallet/connect-copy'
import { Button, ConfirmDialog, Notice } from '@/components/ui'
import { InfoCard } from '@/components/public/support'
import { LinkedWalletRow } from './LinkedWalletRow'

/** The public guide this panel points at — resolved from the shared topic
 *  list, so the title and the slug cannot drift from the support nav's. */
const WALLET_GUIDE = SUPPORT_TOPICS.find((topic) => topic.slug === 'wallet')

type Feedback = { tone: 'success' | 'error'; message: string } | null

export function LinkedWalletsPanel() {
  const wallets = useAuthStore((s) => s.wallets)
  const walletsStatus = useAuthStore((s) => s.walletsStatus)
  const refreshWallets = useAuthStore((s) => s.refreshWallets)
  const linkWallet = useAuthStore((s) => s.linkWallet)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState(false)
  const [unlinkTarget, setUnlinkTarget] = useState<LinkedWallet | null>(null)
  const [unlinking, setUnlinking] = useState(false)

  useEffect(() => {
    void refreshWallets()
  }, [refreshWallets])

  async function handleAddWallet() {
    setBusy(true)
    setFeedback(null)
    try {
      const linked = await linkWallet(reownAdapter)
      setFeedback(
        linked
          ? { tone: 'success', message: 'Wallet linked' }
          : { tone: 'error', message: 'Wallet prompt was closed' },
      )
    } catch (e) {
      // Mobile's no_wallet branch, with web's meaning: not configured, not
      // "no wallet app installed" (WEB_NO_WALLET_COPY is the one source).
      const message =
        e instanceof WalletError && e.code === 'no_wallet'
          ? WEB_NO_WALLET_COPY.description
          : e instanceof ApiClientError
            ? e.message
            : 'Could not link the wallet, please try again'
      setFeedback({ tone: 'error', message })
    } finally {
      setBusy(false)
    }
  }

  async function handleSetPrimary(w: LinkedWallet) {
    setFeedback(null)
    try {
      await api.auth.setPrimaryWallet({ chain_ns: w.chain_ns, address: w.address })
      setFeedback({ tone: 'success', message: `Main ${CHAIN_NAMESPACE_LABEL[w.chain_ns]} wallet updated` })
      await refreshWallets()
    } catch (e) {
      setFeedback({
        tone: 'error',
        message: e instanceof ApiClientError ? e.message : 'Could not update your main wallet',
      })
    }
  }

  async function confirmUnlink() {
    const w = unlinkTarget
    if (w === null) return
    setUnlinking(true)
    setFeedback(null)
    try {
      await api.auth.unlinkWallet({ chain_ns: w.chain_ns, address: w.address })
      setFeedback({ tone: 'success', message: 'Wallet unlinked' })
      await refreshWallets()
      setUnlinkTarget(null)
    } catch (e) {
      // Same guard copy as mobile — the server enforces, we translate.
      if (e instanceof ApiClientError && e.code === ErrorCode.WALLET_IS_PRIMARY) {
        setFeedback({ tone: 'error', message: 'Make another wallet the main one for this chain first, then unlink this one' })
      } else if (e instanceof ApiClientError && e.code === ErrorCode.WALLET_IN_USE) {
        setFeedback({ tone: 'error', message: 'This wallet is part of an active escrow, finish or cancel it first' })
      } else {
        setFeedback({
          tone: 'error',
          message: e instanceof ApiClientError ? e.message : 'Could not unlink the wallet',
        })
      }
    } finally {
      setUnlinking(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold text-content-primary">Linked wallets</h1>
        <p className="text-sm text-content-secondary">
          Any linked wallet can sign you in. You pick a main wallet for each chain,
          and payments on that chain go to it by default.
        </p>
      </header>

      {/* WHY a wallet is needed at all — the shared support intro verbatim
          (never restated locally: two wordings of what a wallet is for is
          exactly the drift the shared copy exists to prevent), with the way
          to the full setup guide. Asked for by the 2026-08-24 redesign: the
          rail now sends people here who have never held a wallet. */}
      <InfoCard label={SUPPORT_WALLET_INTRO.label} body={SUPPORT_WALLET_INTRO.body}>
        {WALLET_GUIDE !== undefined && (
          <Link
            href={`/support/${WALLET_GUIDE.slug}`}
            className="text-sm font-semibold text-brand-primary underline-offset-2 hover:underline"
          >
            {WALLET_GUIDE.title} guide
          </Link>
        )}
      </InfoCard>

      <Notice tone={feedback?.tone ?? 'success'} message={feedback?.message ?? null} />

      <ul className="flex flex-col gap-3">
        {wallets.map((w) => (
          <LinkedWalletRow
            key={`${w.chain_ns}:${w.address}`}
            wallet={w}
            onSetPrimary={() => void handleSetPrimary(w)}
            onUnlink={() => setUnlinkTarget(w)}
          />
        ))}
      </ul>
      {wallets.length === 0 && walletsStatus === 'ready' && (
        <p className="py-4 text-center text-sm text-content-tertiary">
          No wallets linked yet — add your first one below.
        </p>
      )}
      {walletsStatus === 'error' && (
        <div className="flex flex-col items-center gap-2 py-2">
          <p className="text-sm text-content-tertiary">Could not load your wallets.</p>
          <Button variant="ghost" size="md" onClick={() => void refreshWallets()}>
            Retry
          </Button>
        </div>
      )}

      <Button variant="outline" fullWidth disabled={busy} onClick={() => void handleAddWallet()}>
        {busy ? 'Waiting for wallet…' : 'Add another wallet'}
      </Button>

      <ConfirmDialog
        open={unlinkTarget !== null}
        title="Unlink wallet"
        message={
          unlinkTarget !== null
            ? `Remove ${truncateWallet(unlinkTarget.address)} from your account? You can re-link it later.`
            : undefined
        }
        confirmLabel="Unlink"
        destructive
        busy={unlinking}
        onConfirm={() => void confirmUnlink()}
        onCancel={() => setUnlinkTarget(null)}
      />
    </div>
  )
}
