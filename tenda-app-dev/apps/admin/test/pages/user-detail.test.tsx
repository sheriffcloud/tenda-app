import { test, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderPage } from '../test-utils'
import UserDetailPage from '@/app/(dashboard)/users/[id]/page'
import { adminApi, type AdminUserDetail } from '@/api/client'
import { ApiError } from '@/lib/api'
import { setSession } from '@/lib/auth'

vi.mock('@/api/client', () => ({
  adminApi: {
    adminUsers: {
      get: vi.fn(), updateStatus: vi.fn(), updateRole: vi.fn(),
      grantLoginEmail: vi.fn(), revokeLoginEmail: vi.fn(),
    },
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const get = vi.mocked(adminApi.adminUsers.get)

function user(over: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: 'p1', first_name: 'Ada', last_name: 'Lovelace', role: 'user', status: 'active',
    is_seeker: true, country: 'NG', city: 'Lagos', review_score: '4.50',
    created_at: '2026-01-01T00:00:00.000Z', last_active_at: null, bio: null, avatar_url: null,
    phone_e164: null, advanced_mode_enabled: false,
    dispute_metric: { closed_engagements: 8, disputed: 3, dispute_rate_bps: 3750, fraud_flag: true },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setSession('jwt', { id: 'admin', role: 'super_admin', first_name: 'S', last_name: 'A' })
})

test('renders the profile, dispute metric and fraud flag', async () => {
  get.mockResolvedValue(user())
  renderPage(<UserDetailPage />)
  expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument()
  expect(screen.getByText('seeker')).toBeInTheDocument()
  expect(screen.getByText('⚑ fraud flag — review manually')).toBeInTheDocument()
  expect(screen.getByText('37.5%')).toBeInTheDocument() // 3750 bps
})

test('non-flagged users show the below-threshold note', async () => {
  get.mockResolvedValue(user({ dispute_metric: { closed_engagements: 1, disputed: 0, dispute_rate_bps: null, fraud_flag: false } }))
  renderPage(<UserDetailPage />)
  expect(await screen.findByText('Below the flag threshold.')).toBeInTheDocument()
  expect(screen.getByText('no closed engagements')).toBeInTheDocument()
})

test('links the dispute metric to the filtered dispute queue', async () => {
  get.mockResolvedValue(user()) // disputed: 3
  renderPage(<UserDetailPage />)
  const link = await screen.findByRole('link', { name: /View this user's disputes/ })
  expect(link).toHaveAttribute('href', '/disputes?party=p1')
})

test('hides the disputes link when the user has none', async () => {
  get.mockResolvedValue(
    user({ dispute_metric: { closed_engagements: 2, disputed: 0, dispute_rate_bps: 0, fraud_flag: false } }),
  )
  renderPage(<UserDetailPage />)
  await screen.findByText('Below the flag threshold.')
  expect(screen.queryByRole('link', { name: /View this user's disputes/ })).toBeNull()
})

test('a 404 renders the not-found state', async () => {
  get.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'gone'))
  renderPage(<UserDetailPage />)
  expect(await screen.findByText(/User not found/)).toBeInTheDocument()
})
