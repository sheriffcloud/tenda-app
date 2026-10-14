'use client'

/**
 * First-run profile (mobile's profile-setup, name-first web cut): a name is
 * all that's required; avatar/location arrive with the Stage-6 profile
 * editor. Requires a session — the OTP step just created one — and updates
 * profileComplete from the SERVER'S response, not a local guess.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { currentReturnPath, signedInDestination, withReturnPath } from '@/lib/auth/return-path'
import { NAME_MAX_LENGTH, hasCompleteName, verifyErrorMessage } from '@tenda/shared'
import { api } from '@/api/client'
import { AuthPanel } from '@/components/auth/AuthPanel'
import { NamePreview } from '@/components/auth/NamePreview'
import { AUTH_COPY } from '@/components/auth/copy'
import { Button, FormError, TextField } from '@/components/ui'
import { useAuthStore } from '@/stores/auth.store'

export default function OnboardingProfilePage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const loadSession = useAuthStore((s) => s.loadSession)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Arriving straight from verify the store is warm; on a hard reload it
  // bootstraps here. Unauthenticated visitors go to the method chooser.
  useEffect(() => {
    if (isLoading) void loadSession()
  }, [isLoading, loadSession])
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace(withReturnPath('/signin', currentReturnPath()))
  }, [isLoading, isAuthenticated, router])
  useEffect(() => {
    if (user !== null) {
      setFirstName((current) => (current === '' ? user.first_name : current))
      setLastName((current) => (current === '' ? user.last_name : current))
    }
  }, [user])

  // Shared `hasCompleteName`, not a hand-rolled `trim() !== ''` pair: it is the
  // SAME predicate the server's `requireProfileComplete` and the
  // `profile_complete` it answers with are built on. Its own docblock exists
  // because surfaces kept getting this subtly wrong, and a form whose gate
  // disagrees with the server's either blocks a name the server would take or
  // submits one it will refuse — with "Complete your profile" and no visible
  // cause.
  const canSubmit = hasCompleteName(firstName, lastName) && !saving

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      // is_seeker is deliberately NOT sent: it is the Solana Seeker DEVICE
      // fee-tier flag (device-derived at signup, see mobile lib/device.ts),
      // not a preference a web form may set.
      const updated = await api.users.updateMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      })
      useAuthStore.getState().setProfileComplete(updated.profile_complete)
      void useAuthStore.getState().refreshUser()
      // The last leg: the destination this step was carrying (#27).
      router.replace(signedInDestination(currentReturnPath()))
    } catch (e) {
      // Shared `verifyErrorMessage`, the same mapper the other two steps and
      // mobile's three auth screens use. Hand-rolling it here reproduced all
      // of it EXCEPT the clause it exists for: a stale token makes this PATCH
      // answer 401 with the JWT guard's own envelope, and "Invalid or missing
      // token" was rendered verbatim to someone whose only mistake was leaving
      // the tab open.
      setError(verifyErrorMessage(e, AUTH_COPY.profile.failed))
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !isAuthenticated) return null

  return (
    <AuthPanel
      width="wide"
      eyebrow={AUTH_COPY.profile.eyebrow}
      title={AUTH_COPY.profile.title}
      lede={AUTH_COPY.profile.lede}
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSubmit()
        }}
      >
        {/* Side by side above 420px, stacked below — two half-width fields on
            a phone are two fields nobody can type into. */}
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[150px] flex-1">
            <TextField
              label={AUTH_COPY.profile.first}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={AUTH_COPY.profile.firstPlaceholder}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="given-name"
              autoFocus
            />
          </div>
          <div className="min-w-[150px] flex-1">
            <TextField
              label={AUTH_COPY.profile.last}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={AUTH_COPY.profile.lastPlaceholder}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="family-name"
            />
          </div>
        </div>

        <NamePreview firstName={firstName} lastName={lastName} />

        <FormError message={error} />
        <Button type="submit" disabled={!canSubmit} fullWidth>
          {saving ? AUTH_COPY.profile.saving : AUTH_COPY.profile.cta}
        </Button>
      </form>

      <p className="mt-4 type-body-small text-content-tertiary">
        {AUTH_COPY.profile.photoNote}
      </p>
    </AuthPanel>
  )
}
