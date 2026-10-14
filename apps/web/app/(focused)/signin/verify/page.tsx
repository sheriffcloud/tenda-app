'use client'

/**
 * OTP entry (mobile's verify-code, sign-in mode). Auto-verifies at 6 digits,
 * clears the field on failure, 60s resend cooldown carried in the flow store
 * so navigation does not reset it. Success routes by the server's own
 * profile-complete predicate: /home or /onboarding/profile.
 *
 * The expiry the comp asks for is the SERVER's `expires_in`, carried through
 * the flow store — not a constant this app would have to keep in step with the
 * OTP service by hand. When it runs out the page says so and stops offering to
 * verify, because a code the server has already dropped cannot be typed
 * correctly and letting someone try is a worse answer than telling them.
 *
 * The "Verify" CTA is never clickable, and that is the design rather than an
 * oversight: reaching six digits submits, so the button is disabled below six
 * and disabled again the instant it would not be. What it does is REPORT —
 * "Verifying…" is the only feedback that the auto-submit started. Mobile's
 * verify-code screen has the identical pair, so this is the product's pattern
 * and not a web artefact. Coverage will show its onClick unreached; a test
 * that reached it would have to fake a state the page cannot enter.
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { verifyErrorMessage } from '@tenda/shared'
import { api } from '@/api/client'
import { AuthPanel } from '@/components/auth/AuthPanel'
import { AUTH_COPY } from '@/components/auth/copy'
import { Button, FormError } from '@/components/ui'
import { OtpCodeField } from '@/components/auth/OtpCodeField'
import { useAuthStore } from '@/stores/auth.store'
import { useSigninFlowStore } from '@/stores/signin-flow.store'
import { currentReturnPath, signedInDestination, withReturnPath } from '@/lib/auth/return-path'
import { useReturnPath } from '@/hooks/auth/useReturnPath'

const CODE_LENGTH = 6
const RESEND_COOLDOWN_S = 60

/** Whole seconds left of a window that started at `from`. Never negative. */
export function secondsLeft(from: number, windowSeconds: number, now: number): number {
  return Math.max(0, windowSeconds - Math.floor((now - from) / 1_000))
}

/** m:ss, so a two-minute remainder does not read as "119". */
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function SignInVerifyPage() {
  const router = useRouter()
  // For the back link below; the navigations read the URL when they fire.
  const backNext = useReturnPath()
  const pending = useSigninFlowStore((s) => s.pending)
  const markResent = useSigninFlowStore((s) => s.markResent)
  const clearFlow = useSigninFlowStore((s) => s.clear)
  const signInWithVerify = useAuthStore((s) => s.signInWithVerify)

  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  // The cooldown only starts once the challenge RESOLVES, so it cannot guard
  // the request that is still in flight. With no guard at all a double click
  // sent two codes — two emails or two SMS the platform pays for, and the
  // first to arrive already dead, which reads as "the code they sent me does
  // not work". Measured in Chromium (e2e, "sends ONE code, not two").
  //
  // The state drives the label, and it is what disables the button. The LOCK
  // is the ref below: React does flush between two real clicks, so the state
  // flag alone happened to hold in Chromium, but "send this at most once" is
  // not a claim that should rest on scheduling — and a ref is the only form of
  // it that two clicks in a single batch cannot slip past.
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Counts rejected CODES only — see the focus restore below.
  const [rejections, setRejections] = useState(0)
  // One ticking clock drives both countdowns; two intervals would drift apart.
  const [now, setNow] = useState(() => Date.now())
  // A successful verify clears the flow store, which would otherwise trip the
  // no-pending bounce below and race the post-sign-in navigation.
  const succeeded = useRef(false)
  const resendLock = useRef(false)
  const codeField = useRef<HTMLInputElement>(null)

  // Reload or deep link: there is no pending challenge in memory — restart.
  // Carrying the destination through that restart is the whole point: this is
  // the arrival a shared link produces, and dropping it here would lose the
  // deep link for the reader most likely to have one (#27).
  useEffect(() => {
    if (pending === null && !succeeded.current) {
      router.replace(withReturnPath('/signin/email', currentReturnPath()))
    }
  }, [pending, router])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(t)
  }, [])

  // Dropping the identifier once it has been used is the point of `clear`, but
  // calling it in the success path empties THIS card ~35ms before the next
  // route paints (measured) — the reader watches a blank shell in the middle of
  // their own sign-in. On unmount instead: the card stays until the page it
  // navigated to replaces it, and the identifier still does not outlive the
  // flow. Leaving by "Change email" unmounts too, and there `succeeded` is
  // false — that step wants the address it is offering to change.
  useEffect(() => () => {
    if (succeeded.current) clearFlow()
  }, [clearFlow])


  const cooldown = pending === null ? 0 : secondsLeft(pending.sentAt, RESEND_COOLDOWN_S, now)
  // Null window ⇒ no countdown and no expiry claim. The comp shows one because
  // its mock always has a number; the wire makes it optional.
  const validFor =
    pending === null || pending.expiresIn === null
      ? null
      : secondsLeft(pending.sentAt, pending.expiresIn, now)
  const expired = validFor === 0

  // Put the cursor back after a rejected CODE. The field is disabled while the
  // request is in flight and a browser blurs a disabled element, so focus lands
  // on <body> — measured in Chromium — leaving the reader to hunt for the box in
  // the one loop they are most likely to repeat.
  //
  // Keyed on a counter this page bumps for that ONE case, not on `error`: a
  // failed RESEND sets an error too, and restoring on that yanks the cursor out
  // of the button the reader just pressed and into a field whose new code has
  // not arrived. The counter is bumped in the catch, so by the time the effect
  // runs the same batch has already re-enabled the field.
  useEffect(() => {
    if (rejections > 0) codeField.current?.focus()
  }, [rejections])

  async function handleVerify(value: string) {
    if (pending === null || value.length !== CODE_LENGTH || verifying || expired) return
    setVerifying(true)
    setError(null)
    try {
      await signInWithVerify({ method: pending.channel, identifier: pending.identifier, code: value })
      succeeded.current = true
      const { profileComplete } = useAuthStore.getState()
      // Back to where they were going, or the default. An incomplete profile
      // is a waypoint, so it gets the destination handed on rather than
      // consumed here (#27).
      const next = currentReturnPath()
      router.replace(
        profileComplete === true
          ? signedInDestination(next)
          : withReturnPath('/onboarding/profile', next),
      )
    } catch (e) {
      setCode('')
      setError(verifyErrorMessage(e, AUTH_COPY.verify.failed))
      setRejections((n) => n + 1)
    } finally {
      setVerifying(false)
    }
  }

  async function handleResend() {
    // Not while a verify is in flight: a new code invalidates the one being
    // checked, so the reader's own click would fail their own submission.
    if (pending === null || cooldown > 0 || verifying || resendLock.current) return
    resendLock.current = true
    setResending(true)
    setError(null)
    try {
      const { expires_in } = await api.auth.challenge({
        method: pending.channel,
        identifier: pending.identifier,
      })
      markResent(expires_in ?? null)
      setCode('')
    } catch (e) {
      setError(verifyErrorMessage(e, AUTH_COPY.verify.resendFailed))
    } finally {
      resendLock.current = false
      setResending(false)
    }
  }

  if (pending === null) return null

  return (
    <AuthPanel
      width="code"
      title={AUTH_COPY.verify.title}
      lede={AUTH_COPY.verify.lede(pending.identifier)}
      back={{ href: withReturnPath('/signin/email', backNext), label: AUTH_COPY.verify.back }}
    >
      <div className="flex flex-col gap-4">
        <OtpCodeField
          value={code}
          onChange={(digits) => {
            setCode(digits)
            if (digits.length === CODE_LENGTH) void handleVerify(digits)
          }}
          length={CODE_LENGTH}
          autoFocus
          ref={codeField}
          disabled={verifying || expired}
        />

        {/* An expired code is a different situation from a wrong one, and the
            only useful next step is a new code — so it is said plainly rather
            than left for the server to answer with "invalid". */}
        {expired && (
          <p role="alert" className="type-body-small font-semibold text-feedback-danger-text">
            {AUTH_COPY.verify.expired}
          </p>
        )}
        <FormError message={error} />

        <Button
          disabled={code.length !== CODE_LENGTH || verifying || expired}
          onClick={() => void handleVerify(code)}
          fullWidth
        >
          {verifying ? AUTH_COPY.verify.verifying : AUTH_COPY.verify.cta}
        </Button>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="md"
            disabled={cooldown > 0 || verifying || resending}
            onClick={() => void handleResend()}
          >
            {resending
              ? AUTH_COPY.verify.resending
              : cooldown > 0
                ? AUTH_COPY.verify.resendIn(cooldown)
                : AUTH_COPY.verify.resend}
          </Button>
          {/* Only while the code is alive. Once it expires the line above says
              so as an alert, and repeating the same sentence 40px lower reads
              as a rendering fault rather than emphasis. */}
          {validFor !== null && !expired && (
            <span className="ml-auto font-numeric text-xs leading-4 text-content-tertiary">
              {AUTH_COPY.verify.expiresIn(formatClock(validFor))}
            </span>
          )}
        </div>
      </div>
    </AuthPanel>
  )
}
