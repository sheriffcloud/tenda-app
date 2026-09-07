import { test, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ESCROW_LIMITS,
  MAX_PENDING_GIGS_CEILING,
  MAX_OPEN_APPLICATIONS_CEILING,
  MIN_APPLICATION_TTL_SECONDS,
  MAX_APPLICATION_TTL_SECONDS,
  PLATFORM_CONFIG_DEFAULTS,
} from '@tenda/shared'
import type { AdminPlatformConfig } from '@tenda/shared'
import { renderPage } from '../test-utils'
import ConfigPage from '@/app/(dashboard)/config/page'
import { adminApi } from '@/api/client'
import { toast } from 'sonner'

vi.mock('@/api/client', () => ({ adminApi: { platformConfig: { get: vi.fn(), update: vi.fn() } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const get = vi.mocked(adminApi.platformConfig.get)
const update = vi.mocked(adminApi.platformConfig.update)
const ok = vi.mocked(toast.success)
const err = vi.mocked(toast.error)

// No `as` cast: the fixture must satisfy the row type, so a new column fails
// the build here instead of silently going untested (max_pending_gigs did).
const CONFIG: AdminPlatformConfig = {
  id: 1,
  ...PLATFORM_CONFIG_DEFAULTS,
  approval_window_seconds: 172_800,
  default_sponsored_tx_count: 5,
  moderation_rules_version: 2,
}

beforeEach(() => vi.clearAllMocks())

test('loads config into the editable fields + read-only section', async () => {
  get.mockResolvedValue(CONFIG)
  renderPage(<ConfigPage />)
  expect(await screen.findByLabelText('Platform fee (bps)')).toHaveValue(250)
  expect(screen.getByLabelText('Seeker fee (bps)')).toHaveValue(100)
  expect(screen.getByText('172800')).toBeInTheDocument() // read-only approval window
})

test('a cleared field blocks the save instead of zeroing the fee', async () => {
  get.mockResolvedValue(CONFIG)
  renderPage(<ConfigPage />)
  const fee = await screen.findByLabelText('Platform fee (bps)')
  await userEvent.clear(fee)
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(err).toHaveBeenCalledWith('Every field needs a whole number')
  expect(update).not.toHaveBeenCalled()
})

test('a valid save PATCHes the config and toasts success', async () => {
  get.mockResolvedValue(CONFIG)
  update.mockResolvedValueOnce({ ...CONFIG, fee_bps: 300 })
  renderPage(<ConfigPage />)
  const fee = await screen.findByLabelText('Platform fee (bps)')
  await userEvent.clear(fee)
  await userEvent.type(fee, '300')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({
      fee_bps: 300,
      seeker_fee_bps: PLATFORM_CONFIG_DEFAULTS.seeker_fee_bps,
      grace_period_seconds: PLATFORM_CONFIG_DEFAULTS.grace_period_seconds,
      max_pending_gigs: PLATFORM_CONFIG_DEFAULTS.max_pending_gigs,
      unassign_window_seconds: PLATFORM_CONFIG_DEFAULTS.unassign_window_seconds,
      max_open_applications: PLATFORM_CONFIG_DEFAULTS.max_open_applications,
      application_ttl_seconds: PLATFORM_CONFIG_DEFAULTS.application_ttl_seconds,
    }),
  )
  expect(ok).toHaveBeenCalledWith('Config saved — server cache busted')
})

test('loads and edits the worker capacity cap', async () => {
  get.mockResolvedValue(CONFIG)
  update.mockResolvedValueOnce({ ...CONFIG, max_pending_gigs: 3 })
  renderPage(<ConfigPage />)
  const cap = await screen.findByLabelText('Max concurrent gigs / worker')
  expect(cap).toHaveValue(PLATFORM_CONFIG_DEFAULTS.max_pending_gigs)

  await userEvent.clear(cap)
  await userEvent.type(cap, '3')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ max_pending_gigs: 3 })),
  )
})

test('a cleared capacity field blocks the save', async () => {
  get.mockResolvedValue(CONFIG)
  renderPage(<ConfigPage />)
  const cap = await screen.findByLabelText('Max concurrent gigs / worker')
  await userEvent.clear(cap)
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(err).toHaveBeenCalledWith('Every field needs a whole number')
  expect(update).not.toHaveBeenCalled()
})

test('input bounds come from the shared constants the server validates against', async () => {
  get.mockResolvedValue(CONFIG)
  renderPage(<ConfigPage />)
  const fee = await screen.findByLabelText('Platform fee (bps)')
  // Regression: this was hardcoded to 10000 while the API caps at 1000, so the
  // form accepted values the server then rejected.
  expect(fee).toHaveAttribute('max', String(ESCROW_LIMITS.maxPlatformFeeBps))
  expect(screen.getByLabelText('Seeker fee (bps)')).toHaveAttribute(
    'max', String(ESCROW_LIMITS.maxPlatformFeeBps),
  )
  expect(screen.getByLabelText('Grace period (seconds)')).toHaveAttribute(
    'max', String(ESCROW_LIMITS.maxGracePeriodSeconds),
  )
  expect(screen.getByLabelText('Max concurrent gigs / worker')).toHaveAttribute(
    'max', String(MAX_PENDING_GIGS_CEILING),
  )
})

test('loads and edits the unassign window', async () => {
  get.mockResolvedValue(CONFIG)
  update.mockResolvedValueOnce({ ...CONFIG, unassign_window_seconds: 3_600 })
  renderPage(<ConfigPage />)
  const win = await screen.findByLabelText('Unassign window (seconds)')
  expect(win).toHaveValue(PLATFORM_CONFIG_DEFAULTS.unassign_window_seconds)

  await userEvent.clear(win)
  await userEvent.type(win, '3600')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ unassign_window_seconds: 3_600 })),
  )
})

test('a cleared unassign window blocks the save', async () => {
  get.mockResolvedValue(CONFIG)
  renderPage(<ConfigPage />)
  await userEvent.clear(await screen.findByLabelText('Unassign window (seconds)'))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(err).toHaveBeenCalledWith('Every field needs a whole number')
  expect(update).not.toHaveBeenCalled()
})

test('the unassign window input is bounded by the limits both contracts enforce', async () => {
  get.mockResolvedValue(CONFIG)
  renderPage(<ConfigPage />)
  const win = await screen.findByLabelText('Unassign window (seconds)')
  // A value the chain would revert must be unenterable here, not discovered
  // at create time.
  expect(win).toHaveAttribute('min', String(ESCROW_LIMITS.minUnassignWindowSeconds))
  expect(win).toHaveAttribute('max', String(ESCROW_LIMITS.maxUnassignWindowSeconds))
})

describe('application tunables', () => {
  // Same failure this file already caught once for max_pending_gigs: a column
  // added with no way to reach it is a config nobody can change without SQL.
  it('loads and edits both, and blocks the save when either is cleared', async () => {
    get.mockResolvedValue(CONFIG)
    update.mockResolvedValueOnce({ ...CONFIG, max_open_applications: 3 })
    renderPage(<ConfigPage />)

    const cap = await screen.findByLabelText('Max open applications / worker')
    const ttl = await screen.findByLabelText('Application lifetime (seconds)')
    expect(cap).toHaveValue(PLATFORM_CONFIG_DEFAULTS.max_open_applications)
    expect(ttl).toHaveValue(PLATFORM_CONFIG_DEFAULTS.application_ttl_seconds)

    await userEvent.clear(cap)
    await userEvent.type(cap, '3')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ max_open_applications: 3 })),
    )

    await userEvent.clear(ttl)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(err).toHaveBeenCalledWith('Every field needs a whole number')
  })

  it('bounds both inputs by the shared constants the server validates against', async () => {
    get.mockResolvedValue(CONFIG)
    renderPage(<ConfigPage />)
    const cap = await screen.findByLabelText('Max open applications / worker')
    const ttl = await screen.findByLabelText('Application lifetime (seconds)')
    expect(cap).toHaveAttribute('max', String(MAX_OPEN_APPLICATIONS_CEILING))
    expect(ttl).toHaveAttribute('min', String(MIN_APPLICATION_TTL_SECONDS))
    expect(ttl).toHaveAttribute('max', String(MAX_APPLICATION_TTL_SECONDS))
  })
})
