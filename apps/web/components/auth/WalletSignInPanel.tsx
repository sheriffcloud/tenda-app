'use client'

/**
 * Wallet sign-in (S3.4). Decision #3 is server-enforced: a wallet only signs
 * in to an account it is already linked to — the verify route answers 404
 * WALLET_NOT_LINKED for an unknown wallet, and that answer is a FIRST-CLASS
 * state here (guidance to email sign-up + try-another-wallet), never a toast.
 * A user decline quietly returns to idle; other failures render the shared
 * connect-error copy.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { currentReturnPath, signedInDestination, withReturnPath } from '@/lib/auth/return-path'
import { useReturnPath } from '@/hooks/auth/useReturnPath'
import {
  ApiClientError,
  ErrorCode,
  classifyConnectError,
  type ConnectErrorCopy,
} from '@tenda/shared'
import { useAuthStore } from '@/stores/auth.store'
import { reownAdapter } from '@/wallet/adapters/reown'
import { WEB_NO_WALLET_COPY } from '@/wallet/connect-copy'
import { getEnv } from '@/lib/config/env'
import { Button, buttonVariants } from '@/components/ui'
import { AuthPanel } from './AuthPanel'
import { AUTH_COPY } from './copy'
import { TermsNotice } from './TermsNotice'

type PanelState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'not_linked' }
  | { kind: 'error'; copy: ConnectErrorCopy }

function EmailLink({ variant, next }: { variant: 'primary' | 'outline'; next: string | null }) {
  return (
    <Link href={withReturnPath('/signin/email', next)} className={buttonVariants({ variant })}>
      {AUTH_COPY.wallet.email}
    </Link>
  )
}

export function WalletSignInPanel() {
  const router = useRouter()
  // Every wallet state is a step past the chooser, so every one offers the way
  // back — and back now carries the destination, as does the lateral switch to
  // email. Both are RENDERED, so they take the late value; the sign-in
  // navigation below reads the URL at the moment it fires (#27).
  const next = useReturnPath()
  const back = { href: withReturnPath('/signin', next), label: AUTH_COPY.wallet.back }
  const signInWithWallet = useAuthStore((s) => s.signInWithWallet)
  const [state, setState] = useState<PanelState>({ kind: 'idle' })
  const [available, setAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    void reownAdapter.isAvailable().then(setAvailable)
  }, [])

  async function handleConnect(opts?: { fresh?: boolean }) {
    setState({ kind: 'connecting' })
    try {
      // "Try another wallet": drop the session first so the modal re-opens
      // instead of fast-pathing back to the wallet that just 404'd.
      if (opts?.fresh) await reownAdapter.disconnect().catch(() => {})
      const signedIn = await signInWithWallet(reownAdapter)
      if (!signedIn) {
        setState({ kind: 'idle' }) // declined in the wallet — no error banner
        return
      }
      // Same destination rule as the OTP path — one function, so the two ways
      // in cannot land differently (#27).
      const next = currentReturnPath()
      router.replace(
        useAuthStore.getState().profileComplete === true
          ? signedInDestination(next)
          : withReturnPath('/onboarding/profile', next),
      )
    } catch (error) {
      if (error instanceof ApiClientError && error.code === ErrorCode.WALLET_NOT_LINKED) {
        setState({ kind: 'not_linked' })
        return
      }
      setState({
        kind: 'error',
        copy: classifyConnectError(error, {
          devDetail: getEnv() === 'development',
          noWalletCopy: WEB_NO_WALLET_COPY,
        }),
      })
    }
  }

  if (state.kind === 'not_linked') {
    return (
      <AuthPanel
        back={back}
        title={AUTH_COPY.wallet.notLinkedTitle}
        lede={AUTH_COPY.wallet.notLinkedLede}
      >
        <div className="flex flex-col gap-3">
          <EmailLink next={next} variant="primary" />
          <Button variant="outline" fullWidth onClick={() => void handleConnect({ fresh: true })}>
            {AUTH_COPY.wallet.tryAnother}
          </Button>
        </div>
      </AuthPanel>
    )
  }

  if (state.kind === 'error') {
    return (
      <AuthPanel back={back} title={state.copy.title} lede={state.copy.description}>
        <div className="flex flex-col gap-3">
          <Button variant="primary" fullWidth onClick={() => void handleConnect()}>
            {AUTH_COPY.wallet.retry}
          </Button>
          {/* No secondary-URL action here: web's no_wallet override carries no
              link, and every other web-reachable copy is link-free. */}
          <EmailLink next={next} variant="outline" />
        </div>
      </AuthPanel>
    )
  }

  const connecting = state.kind === 'connecting'
  return (
    <AuthPanel
      back={back}
      title={AUTH_COPY.wallet.title}
      lede={AUTH_COPY.wallet.lede}
    >
      <div className="flex flex-col gap-3">
        {available === false ? (
          <p className="text-sm text-content-secondary">{WEB_NO_WALLET_COPY.description}</p>
        ) : (
          <Button
            variant="primary"
            fullWidth
            disabled={connecting || available === null}
            onClick={() => void handleConnect()}
          >
            {connecting ? AUTH_COPY.wallet.connecting : AUTH_COPY.wallet.connect}
          </Button>
        )}
        <EmailLink next={next} variant="outline" />
      </div>
      <TermsNotice verb="connecting" />
    </AuthPanel>
  )
}
