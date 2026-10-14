'use client'

/**
 * Ends the session. Rendered on /profile, where mobile puts it
 * (apps/mobile/app/(tabs)/profile.tsx), and on /settings, where the Settings
 * comp puts it, and in the workspace rail. One component and controller keep
 * the behavior consistent across all three placements. The comp's longer
 * "Sign out of this device" is not adopted,
 * see spec-corrections.md.
 *
 * No confirm dialog: mobile signs out directly, and the action is cheap to
 * undo by signing back in. Copy stays web's shipped "Sign out" rather than
 * mobile's "Disconnect", which on web reads as disconnecting a wallet.
 */
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useSignOut } from '@/hooks/auth/useSignOut'

export function SignOutButton({ variant = 'card', showLabel = true }: { variant?: 'card' | 'rail'; showLabel?: boolean }) {
  const { busy, signOut } = useSignOut()

  return (
    <button
      type="button"
      aria-label={busy ? 'Signing out' : 'Sign out'}
      onClick={() => void signOut()}
      disabled={busy}
      className={cn(
        'flex items-center gap-3 text-sm font-semibold text-feedback-danger-text transition-colors disabled:opacity-60',
        variant === 'card' ? 'justify-center rounded-card border border-feedback-danger-border px-4 py-3 hover:bg-feedback-danger-surface' : 'h-10 w-full rounded-control px-3 hover:bg-feedback-danger-surface',
      )}
    >
      <LogOut size={16} aria-hidden />
      {showLabel && (busy ? 'Signing out…' : 'Sign out')}
    </button>
  )
}
