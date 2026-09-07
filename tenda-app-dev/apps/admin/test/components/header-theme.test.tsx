import { test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// File-local dark-mode theme mock (overrides the light-mode setup mock) to
// cover the header's dark branch: sun icon + toggle back to light.
const setTheme = vi.fn()
vi.mock('@/providers/theme', () => ({
  useAdminTheme: () => ({ theme: 'dark', resolvedTheme: 'dark', setTheme }),
}))

import { AppHeader } from '@/components/layout/header'
import { SidebarProvider } from '@/components/ui/sidebar'

test('header in dark mode toggles back to light', async () => {
  render(
    <SidebarProvider>
      <AppHeader title="X" />
    </SidebarProvider>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Toggle theme' }))
  expect(setTheme).toHaveBeenCalledWith('light')
})
