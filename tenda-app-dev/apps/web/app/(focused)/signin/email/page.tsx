'use client'

/**
 * Email entry (mobile's continue-with, email branch). Sends the OTP challenge
 * ANONYMOUSLY — the server treats a present bearer as link intent and would
 * hard-401 a stale one. The identifier rides the in-memory signin-flow store,
 * never the URL (PII in query strings ends up in history and logs).
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { normalizeEmail, verifyErrorMessage } from '@tenda/shared'
import { api } from '@/api/client'
import { AuthPanel } from '@/components/auth/AuthPanel'
import { AUTH_COPY } from '@/components/auth/copy'
import { Button, FormError, Spinner, TextField } from '@/components/ui'
import { useSigninFlowStore } from '@/stores/signin-flow.store'
import { currentReturnPath, withReturnPath } from '@/lib/auth/return-path'
import { useReturnPath } from '@/hooks/auth/useReturnPath'

export default function SignInEmailPage() {
  const router = useRouter()
  // Threaded, not stored: the flow store is in-memory by design, and a deep
  // link is exactly the case where the tab was opened fresh (#27).
  //
  // The BACK link needs it while rendering; `useReturnPath` explains why that
  // arrives a beat late.
  const backNext = useReturnPath()
  const begin = useSigninFlowStore((s) => s.begin)
  const pending = useSigninFlowStore((s) => s.pending)
  // Seeded from the pending challenge, so arriving here through the verify
  // step's "Change email" shows the address you are changing instead of an
  // empty box you have to retype. Initial state only — typing over it must not
  // be undone by a later render.
  const [email, setEmail] = useState(() => pending?.identifier ?? '')
  const [busy, setBusy] = useState(false)
  const requestInFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const normalized = normalizeEmail(email) ?? ''
  const valid = normalized !== ''
  const showInvalid = email.trim() !== '' && !valid

  async function handleSendCode() {
    if (!valid || requestInFlight.current) return
    requestInFlight.current = true
    setBusy(true)
    setError(null)
    try {
      // `expires_in` is the server's own validity window; the verify step
      // counts it down rather than repeating a number typed into this app.
      const { expires_in } = await api.auth.challenge({ method: 'email', identifier: normalized })
      begin('email', normalized, expires_in ?? null)
      router.push(withReturnPath('/signin/verify', currentReturnPath()))
    } catch (e) {
      setError(verifyErrorMessage(e, AUTH_COPY.email.failed))
    } finally {
      requestInFlight.current = false
      setBusy(false)
    }
  }

  return (
    <AuthPanel
      title={AUTH_COPY.email.title}
      lede={AUTH_COPY.email.lede}
      back={{ href: withReturnPath('/signin', backNext), label: AUTH_COPY.email.back }}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSendCode()
        }}
      >
        <TextField
          label={AUTH_COPY.email.label}
          type="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          autoFocus
          error={showInvalid ? AUTH_COPY.email.invalid : null}
        />
        <FormError message={error} />
        <Button type="submit" disabled={!valid || busy} fullWidth aria-busy={busy}>
          {busy && <Spinner size="sm" />}
          <span aria-live="polite">{busy ? AUTH_COPY.email.sending : AUTH_COPY.email.cta}</span>
        </Button>
      </form>

      {/* Answers the question this step actually raises: someone who cannot
          remember whether they already signed up needs to know that typing
          the address is safe either way. */}
      <p className="mt-4 type-body-small text-content-tertiary">
        {AUTH_COPY.email.collision}
      </p>
    </AuthPanel>
  )
}
