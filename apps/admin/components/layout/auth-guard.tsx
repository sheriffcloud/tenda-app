'use client'

/**
 * Client-side session guard (#90) — the deliberate replacement for Edge
 * middleware (open_issues A5): no token → /login. UX convenience only;
 * the API server independently authorizes every request and lib/api.ts
 * bounces 401s back to /login.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth'
import { useSessionToken } from '@/lib/use-session'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  // Re-renders on storage changes (incl. cross-tab logout). During SSR and
  // the hydration render this is null, so nothing protected ever flashes.
  const token = useSessionToken()

  useEffect(() => {
    // Read localStorage directly: by effect time it is always current,
    // even if the hook value above is still the hydration snapshot.
    if (getToken() === null) router.replace('/login')
  }, [token, router])

  if (token === null) return null
  return <>{children}</>
}
