/**
 * Disputes queue — the `?party=<userId>` deep-link (from user detail /
 * listings) narrows every fetch to one user's disputes, defaults to the All
 * tab, and shows a clearable scope banner.
 */
import { test, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderPage } from '../test-utils'
import { adminApi } from '@/api/client'
import { setSession } from '@/lib/auth'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/disputes',
  useSearchParams: () => new URLSearchParams('party=u42'),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}))
vi.mock('@/api/client', () => ({
  adminApi: { disputes: { list: vi.fn(), claim: vi.fn(), release: vi.fn() } },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import DisputesPage from '@/app/(dashboard)/disputes/page'

const paginated = { data: [], total: 0, limit: 20, offset: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setSession('jwt', { id: 'me', role: 'super_admin', first_name: 'S', last_name: 'A' })
})

test('party deep-link narrows the query and shows a clearable banner', async () => {
  vi.mocked(adminApi.disputes.list).mockResolvedValue(paginated)
  renderPage(<DisputesPage />)
  expect(await screen.findByText(/Filtered to one user's disputes/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Clear filter/ })).toHaveAttribute('href', '/disputes')
  await waitFor(() =>
    expect(adminApi.disputes.list).toHaveBeenLastCalledWith(expect.objectContaining({ party: 'u42' })),
  )
})

test('with a party, the default tab is All (no assignment/status filter)', async () => {
  vi.mocked(adminApi.disputes.list).mockResolvedValue(paginated)
  renderPage(<DisputesPage />)
  await waitFor(() =>
    expect(adminApi.disputes.list).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ assigned: expect.anything() }),
    ),
  )
})
