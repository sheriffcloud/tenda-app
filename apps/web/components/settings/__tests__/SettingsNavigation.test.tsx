import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_CARDS } from '@/components/settings/copy'

const pathname = { current: '/settings' }
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }))

import { SettingsNavigation } from '@/components/settings/SettingsNavigation'

beforeEach(() => {
  pathname.current = '/settings'
})

describe('SettingsNavigation', () => {
  it('does not duplicate the index cards on the settings root', () => {
    render(<SettingsNavigation />)
    expect(screen.queryByRole('navigation', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('adds a settings back link and marks the active nested page', () => {
    pathname.current = '/settings/security'
    render(<SettingsNavigation />)
    expect(screen.getByRole('link', { name: /^Settings$/ })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('link', { name: 'Sign-in methods' })).toHaveAttribute('aria-current', 'page')
    for (const item of SETTINGS_CARDS.filter((entry) => entry.href.startsWith('/settings/'))) {
      expect(screen.getByRole('link', { name: item.title })).toHaveAttribute('href', item.href)
    }
  })
})
