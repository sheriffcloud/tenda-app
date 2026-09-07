import { test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { AuthGuard } from '@/components/layout/auth-guard'
import { AppHeader } from '@/components/layout/header'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/sidebar'
import { setSession, clearSession } from '@/lib/auth'

// Not a real hook call — retrieves the stable router stub the setup mock returns.
// eslint-disable-next-line react-hooks/rules-of-hooks
const router = vi.mocked(useRouter())

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

// ── AuthGuard ────────────────────────────────────────────────────────────────
test('AuthGuard renders children when a token is present', () => {
  setSession('jwt', { id: 'u1', role: 'super_admin', first_name: 'A', last_name: 'B' })
  render(
    <AuthGuard>
      <p>protected</p>
    </AuthGuard>,
  )
  expect(screen.getByText('protected')).toBeInTheDocument()
})

test('AuthGuard renders nothing and redirects to /login without a token', () => {
  render(
    <AuthGuard>
      <p>protected</p>
    </AuthGuard>,
  )
  expect(screen.queryByText('protected')).toBeNull()
  expect(router.replace).toHaveBeenCalledWith('/login')
})

// ── AppHeader ────────────────────────────────────────────────────────────────
test('AppHeader shows the title and a theme toggle', async () => {
  render(
    <SidebarProvider>
      <AppHeader title="Disputes" />
    </SidebarProvider>,
  )
  expect(screen.getByRole('heading', { name: 'Disputes' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Toggle theme' }))
})

// ── AppSidebar ───────────────────────────────────────────────────────────────
function renderSidebar() {
  return render(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>,
  )
}

test('AppSidebar shows every management surface for a super_admin', () => {
  setSession('jwt', { id: 'u1', role: 'super_admin', first_name: 'Su', last_name: 'Ad' })
  renderSidebar()
  expect(screen.getByText('Tenda Admin')).toBeInTheDocument()
  expect(screen.getByText(/Su Ad · super_admin/)).toBeInTheDocument()
  // a sample of the permission-gated links
  expect(screen.getByText('Disputes')).toBeInTheDocument()
  expect(screen.getByText('Users')).toBeInTheDocument()
  expect(screen.getByText('Platform Config')).toBeInTheDocument()
})

test('AppSidebar restricts a dispute_admin to its surfaces', () => {
  setSession('jwt', { id: 'u2', role: 'dispute_admin', first_name: 'Di', last_name: 'Ad' })
  renderSidebar()
  expect(screen.getByText('Disputes')).toBeInTheDocument()
  expect(screen.getByText('Listings')).toBeInTheDocument()
  expect(screen.queryByText('Platform Config')).toBeNull()
  expect(screen.queryByText('Users')).toBeNull()
})

test('AppSidebar shows no links and no identity when logged out', () => {
  renderSidebar()
  expect(screen.queryByText('Disputes')).toBeNull()
})

test('AppSidebar sign-out clears the session and routes to /login', async () => {
  setSession('jwt', { id: 'u1', role: 'super_admin', first_name: 'S', last_name: 'A' })
  renderSidebar()
  await userEvent.click(screen.getByText('Sign out'))
  expect(localStorage.getItem('tenda_admin_token')).toBeNull()
  expect(router.push).toHaveBeenCalledWith('/login')
  clearSession()
})
