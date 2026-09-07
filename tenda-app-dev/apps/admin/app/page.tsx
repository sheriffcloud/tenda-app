'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth'

/** Route directly to the correct entry surface without rendering a protected page first. */
export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace(getToken() === null ? '/login' : '/disputes')
  }, [router])

  return null
}
