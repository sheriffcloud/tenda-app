'use client'

/**
 * The public header's right-side action: "Sign in" for visitors, "Home" once
 * a token exists — the public pages ARE part of the app, so "open app" would
 * be a lie. Client-only knowledge (localStorage), so it renders the visitor
 * variant until mounted — stable SSR markup, no hydration mismatch.
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getJwtToken } from '@/lib/storage'
import { buttonVariants } from '@/components/ui'
import { ThemeToggle } from '@/components/app/ThemeToggle'

export function HeaderSessionAction() {
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    void getJwtToken().then((token) => setHasSession(token !== null && token !== ''))
  }, [])

  return (
    <span className="flex items-center gap-2">
      <ThemeToggle />
      <Link href={hasSession ? '/home' : '/signin'} className={buttonVariants({ size: 'md' })}>
        {hasSession ? 'Home' : 'Sign in'}
      </Link>
    </span>
  )
}
