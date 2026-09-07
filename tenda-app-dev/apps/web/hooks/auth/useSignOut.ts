'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth.store'
import { showToast } from '@/components/ui/Toast'
import { ROUTES } from '@/lib/routes'

export function useSignOut() {
  const router = useRouter()
  const logout = useAuthStore((state) => state.logout)
  const [busy, setBusy] = useState(false)
  async function signOut() {
    setBusy(true)
    try {
      await logout()
      router.replace(ROUTES.root)
    } catch {
      showToast('error', 'Could not sign out. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, signOut }
}
