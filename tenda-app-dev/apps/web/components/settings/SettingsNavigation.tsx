'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/cn'
import { SETTINGS_CARDS } from './copy'

const SETTINGS_LINKS = SETTINGS_CARDS.filter((item) => item.href.startsWith('/settings/'))

export function SettingsNavigation() {
  const pathname = usePathname()
  const nested = pathname !== '/settings'
  if (!nested) return null

  return (
    <nav
      aria-label="Settings"
      className="border-b border-border-subtle bg-surface-navbar px-4 py-3 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 overflow-x-auto">
        <Link
          href="/settings"
          className="mr-1 flex shrink-0 items-center gap-1 rounded-control px-2 py-1.5 text-sm font-semibold text-content-primary hover:bg-surface-inset"
        >
          <ChevronLeft size={16} aria-hidden /> Settings
        </Link>
        {SETTINGS_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold',
              pathname === item.href
                ? 'border-brand-primary-border bg-brand-primary-surface text-brand-primary'
                : 'border-border-default text-content-secondary hover:bg-surface-inset',
            )}
          >
            {item.title}
          </Link>
        ))}
      </div>
    </nav>
  )
}
