import { test, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import type { PaginatedResponse, Announcement, AdminEscrowRow } from '@tenda/shared'
import { renderPage } from '../test-utils'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { setSession } from '@/lib/auth'
import EscrowsPage from '@/app/(dashboard)/escrows/page'
import FiatPage from '@/app/(dashboard)/fiat/page'
import ModerationPage from '@/app/(dashboard)/moderation/page'
import FeaturedPage from '@/app/(dashboard)/featured/page'
import AnnouncementsPage from '@/app/(dashboard)/announcements/page'
import DisputesPage from '@/app/(dashboard)/disputes/page'

vi.mock('@/api/client', () => ({
  adminApi: {
    escrows: { list: vi.fn(), setHidden: vi.fn() },
    fiat: { intents: vi.fn(), providers: vi.fn(), forceSettle: vi.fn(), refund: vi.fn(), updateProvider: vi.fn() },
    moderation: { verdicts: vi.fn(), override: vi.fn() },
    featured: { list: vi.fn(), create: vi.fn(), remove: vi.fn() },
    announcements: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    disputes: { list: vi.fn(), claim: vi.fn(), release: vi.fn() },
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const err = vi.mocked(toast.error)
function paginated<T>(rows: T[]): PaginatedResponse<T> {
  return { data: rows, total: rows.length, limit: 20, offset: 0 }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setSession('jwt', { id: 'me', role: 'super_admin', first_name: 'S', last_name: 'A' })
})

test('escrows: empty state + header after load', async () => {
  vi.mocked(adminApi.escrows.list).mockResolvedValue(paginated<AdminEscrowRow>([]))
  renderPage(<EscrowsPage />)
  expect(await screen.findByText('No listings match.')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Listings' })).toBeInTheDocument()
})

test('escrows: a failed load toasts an error', async () => {
  vi.mocked(adminApi.escrows.list).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'esc fail'))
  renderPage(<EscrowsPage />)
  await waitFor(() => expect(err).toHaveBeenCalledWith('esc fail'))
})

test('fiat: loads intents + providers in parallel and shows the empty state', async () => {
  vi.mocked(adminApi.fiat.intents).mockResolvedValue({ intents: [] })
  vi.mocked(adminApi.fiat.providers).mockResolvedValue({ providers: [] })
  renderPage(<FiatPage />)
  expect(await screen.findByText('No intents match.')).toBeInTheDocument()
  expect(adminApi.fiat.providers).toHaveBeenCalled()
})

test('moderation: empty verdict queue', async () => {
  vi.mocked(adminApi.moderation.verdicts).mockResolvedValue({ verdicts: [], page: 0 })
  renderPage(<ModerationPage />)
  expect(await screen.findByText('No verdicts here.')).toBeInTheDocument()
})

test('featured: header renders and slots load', async () => {
  vi.mocked(adminApi.featured.list).mockResolvedValue({ data: [] })
  renderPage(<FeaturedPage />)
  expect(await screen.findByRole('heading', { name: 'Featured' })).toBeInTheDocument()
  await waitFor(() => expect(adminApi.featured.list).toHaveBeenCalled())
})

test('announcements: header renders and the list loads', async () => {
  vi.mocked(adminApi.announcements.list).mockResolvedValue(paginated<Announcement>([]))
  renderPage(<AnnouncementsPage />)
  expect(await screen.findByRole('heading', { name: 'Announcements' })).toBeInTheDocument()
  await waitFor(() => expect(adminApi.announcements.list).toHaveBeenCalled())
})

test('disputes: shows the loading state then the empty table', async () => {
  vi.mocked(adminApi.disputes.list).mockResolvedValue(paginated([]))
  renderPage(<DisputesPage />)
  expect(screen.getByText('Loading…')).toBeInTheDocument()
  expect(await screen.findByText('No disputes here.')).toBeInTheDocument()
})

test('disputes: a failed load toasts an error AND clears the spinner', async () => {
  // `loading` is derived from the settled request key, so a failure path that
  // forgets to record the key leaves the page stuck on "Loading…" forever.
  vi.mocked(adminApi.disputes.list).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'dis fail'))
  renderPage(<DisputesPage />)
  await waitFor(() => expect(err).toHaveBeenCalledWith('dis fail'))
  expect(screen.queryByText('Loading…')).toBeNull()
  expect(screen.getByText('No disputes here.')).toBeInTheDocument()
})
