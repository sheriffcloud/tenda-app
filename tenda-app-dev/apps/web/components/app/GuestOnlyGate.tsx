'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionBootstrap } from '@/hooks/auth/useSessionBootstrap'
import { currentReturnPath, withReturnPath } from '@/lib/auth/return-path'
import { ROUTES } from '@/lib/routes'
import { useAuthStore } from '@/stores/auth.store'

/** Keeps completed sessions out of sign-in and welcome surfaces. */
export function GuestOnlyGate({ children }: { children: ReactNode }) {
  const router = useRouter()
  const isLoading = useAuthStore((state) => state.isLoading)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const profileComplete = useAuthStore((state) => state.profileComplete)
  useSessionBootstrap()

  useEffect(() => {
    if (isLoading || !isAuthenticated) return
    router.replace(
      profileComplete === false
        ? withReturnPath('/onboarding/profile', currentReturnPath())
        : ROUTES.home,
    )
  }, [isAuthenticated, isLoading, profileComplete, router])

  // Keep the current heading mounted until the replacement route commits.
  // Removing it here creates a measurable blank shell between auth success
  // and /home. The effect above still prevents the route from settling here.
  return <>{children}</>
}
