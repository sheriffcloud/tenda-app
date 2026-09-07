import type { ReactNode } from 'react'
import { AuthGate } from '@/components/app/AuthGate'
import { AppWorkspace } from '@/components/app/AppWorkspace'

/**
 * The guarded half of the focused route group.
 *
 * Composer routes need a session; /signin and /onboarding/profile are how you get one,
 * so they must stay reachable signed-out. A nested route group is the smallest
 * way to say that — it adds the gate and workspace without changing the URLs.
 */
export default function FocusedAuthedLayout({ children }: { children: ReactNode }) {
  return <AuthGate><AppWorkspace>{children}</AppWorkspace></AuthGate>
}
