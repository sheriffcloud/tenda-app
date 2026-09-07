import { test, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderPage } from '../test-utils'
import MetricsPage from '@/app/(dashboard)/metrics/page'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { toast } from 'sonner'

vi.mock('@/api/client', () => ({ adminApi: { metrics: { get: vi.fn() } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const get = vi.mocked(adminApi.metrics.get)
const err = vi.mocked(toast.error)

beforeEach(() => vi.clearAllMocks())

test('renders the metric cards once data resolves', async () => {
  get.mockResolvedValue({ metrics: { total_users: 42, active_24h: 5, active_7d: 12, active_30d: 30, suspended: 3 } })
  renderPage(<MetricsPage />)
  expect(await screen.findByText('42')).toBeInTheDocument()
  expect(screen.getByText('Total users')).toBeInTheDocument()
  expect(screen.getByText('Suspended')).toBeInTheDocument()
})

test('a failed load surfaces an error toast', async () => {
  get.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'down'))
  renderPage(<MetricsPage />)
  await waitFor(() => expect(err).toHaveBeenCalledWith('down'))
})
