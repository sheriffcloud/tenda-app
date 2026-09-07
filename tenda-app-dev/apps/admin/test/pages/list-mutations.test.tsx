import { test, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Announcement, AdminEscrowRow, FeaturedSlotRow } from '@tenda/shared'
import { renderPage } from '../test-utils'
import { adminApi, type FiatIntentRow, type FiatProviderRow, type ModerationVerdictRow } from '@/api/client'
import EscrowsPage from '@/app/(dashboard)/escrows/page'
import FeaturedPage from '@/app/(dashboard)/featured/page'
import AnnouncementsPage from '@/app/(dashboard)/announcements/page'
import ModerationPage from '@/app/(dashboard)/moderation/page'
import FiatPage from '@/app/(dashboard)/fiat/page'

vi.mock('@/api/client', () => ({
  adminApi: {
    escrows: { list: vi.fn(), setHidden: vi.fn() },
    featured: { list: vi.fn(), create: vi.fn(), remove: vi.fn() },
    announcements: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    moderation: { verdicts: vi.fn(), override: vi.fn() },
    fiat: { intents: vi.fn(), providers: vi.fn(), forceSettle: vi.fn(), refund: vi.fn(), updateProvider: vi.fn() },
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const paginated = <T,>(rows: T[]) => ({ data: rows, total: rows.length, limit: 20, offset: 0 })
beforeEach(() => vi.clearAllMocks())

// ── escrows: takedown toggle ───────────────────────────────────────────────
const escrowRow = {
  id: 'e1', kind: 'gig', status: 'open', title: 'Fix the sink', hidden: false,
  city: 'Lagos', country: 'NG', creator_first_name: 'Ada', creator_last_name: 'L',
} as AdminEscrowRow

test('escrows: Hide opens confirm and calls setHidden(true)', async () => {
  vi.mocked(adminApi.escrows.list).mockResolvedValue(paginated([escrowRow]))
  vi.mocked(adminApi.escrows.setHidden).mockResolvedValue({ id: 'e1', hidden: true })
  renderPage(<EscrowsPage />)
  expect(await screen.findByText('Fix the sink')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Hide' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Hide listing' }))
  await waitFor(() => expect(adminApi.escrows.setHidden).toHaveBeenCalledWith('e1', true))
})

test('escrows: a hidden row offers Restore, which un-hides', async () => {
  vi.mocked(adminApi.escrows.list).mockResolvedValue(paginated([{ ...escrowRow, hidden: true } as AdminEscrowRow]))
  vi.mocked(adminApi.escrows.setHidden).mockResolvedValue({ id: 'e1', hidden: false })
  renderPage(<EscrowsPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'Restore' }))
  await waitFor(() => expect(adminApi.escrows.setHidden).toHaveBeenCalledWith('e1', false))
})

// ── featured: schedule + remove ────────────────────────────────────────────
const slot = {
  id: 's1', escrow_id: 'e1', title: 'Promoted gig',
  starts_at: '2026-06-10T10:00:00.000Z', ends_at: '2026-06-20T10:00:00.000Z', position: 0,
} as FeaturedSlotRow

test('featured: scheduling a slot calls create with ISO timestamps', async () => {
  vi.mocked(adminApi.featured.list).mockResolvedValue({ data: [] })
  vi.mocked(adminApi.featured.create).mockResolvedValue(slot)
  renderPage(<FeaturedPage />)
  await userEvent.type(screen.getByLabelText('Gig escrow id'), 'e1')
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-06-10T10:00' } })
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-06-20T10:00' } })
  await userEvent.click(screen.getByRole('button', { name: 'Schedule' }))
  await waitFor(() => expect(adminApi.featured.create).toHaveBeenCalled())
  expect(vi.mocked(adminApi.featured.create).mock.calls[0]![0].escrow_id).toBe('e1')
})

test('featured: Remove deletes the slot', async () => {
  vi.mocked(adminApi.featured.list).mockResolvedValue({ data: [slot] })
  vi.mocked(adminApi.featured.remove).mockResolvedValue({ deleted: true })
  renderPage(<FeaturedPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'Remove' }))
  await waitFor(() => expect(adminApi.featured.remove).toHaveBeenCalledWith('s1'))
})

// ── announcements: publish + toggle + delete ───────────────────────────────
const announcement = {
  id: 'a1', title: 'Heads up', body: 'Maintenance', priority: 1, is_active: true, expires_at: null,
} as Announcement

test('announcements: Publish creates with trimmed fields', async () => {
  vi.mocked(adminApi.announcements.list).mockResolvedValue(paginated([]))
  vi.mocked(adminApi.announcements.create).mockResolvedValue(announcement)
  renderPage(<AnnouncementsPage />)
  await userEvent.type(screen.getByLabelText('Title'), 'Heads up')
  await userEvent.type(screen.getByLabelText('Body'), 'Maintenance')
  await userEvent.click(screen.getByRole('button', { name: 'Publish' }))
  await waitFor(() =>
    expect(adminApi.announcements.create).toHaveBeenCalledWith({ title: 'Heads up', body: 'Maintenance', priority: 0 }),
  )
})

test('announcements: toggling active updates and Delete removes', async () => {
  vi.mocked(adminApi.announcements.list).mockResolvedValue(paginated([announcement]))
  vi.mocked(adminApi.announcements.update).mockResolvedValue(announcement)
  vi.mocked(adminApi.announcements.remove).mockResolvedValue({ id: 'a1' })
  renderPage(<AnnouncementsPage />)
  await screen.findByText('Heads up')
  await userEvent.click(screen.getByRole('switch'))
  await waitFor(() => expect(adminApi.announcements.update).toHaveBeenCalledWith('a1', { is_active: false }))
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(adminApi.announcements.remove).toHaveBeenCalledWith('a1'))
})

// ── moderation: override ───────────────────────────────────────────────────
const verdict = {
  id: 'm1', subject_kind: 'gig', subject_id: 'g1', decision: 'block', reasons: ['spam'],
  provider: 'openrouter', model: 'gpt', cost_usd: '0.01', latency_ms: 120, created_at: '2026-06-10T00:00:00.000Z',
} as ModerationVerdictRow

test('moderation: a verdict can be overridden with a reason', async () => {
  vi.mocked(adminApi.moderation.verdicts).mockResolvedValue({ verdicts: [verdict], page: 0 })
  vi.mocked(adminApi.moderation.override).mockResolvedValue(undefined)
  renderPage(<ModerationPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'Override' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.type(within(dialog).getByPlaceholderText('Why is the verdict wrong?'), 'false positive')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Override' }))
  await waitFor(() => expect(adminApi.moderation.override).toHaveBeenCalledWith('m1', 'false positive'))
})

// ── fiat: provider toggle + intent override ────────────────────────────────
const provider = { id: 'yc', display_name: 'Yellow Card', priority: 1, is_enabled: true } as FiatProviderRow
const intent = {
  id: 'i1', direction: 'onramp', fiat_amount: '50000', fiat_currency: 'NGN',
  asset_amount_raw: '30000000', asset: 'USDC_BASE', provider: 'yc', status: 'awaiting_provider',
  created_at: '2026-06-10T00:00:00.000Z',
} as FiatIntentRow

test('fiat: toggling a provider calls updateProvider', async () => {
  vi.mocked(adminApi.fiat.intents).mockResolvedValue({ intents: [] })
  vi.mocked(adminApi.fiat.providers).mockResolvedValue({ providers: [provider] })
  vi.mocked(adminApi.fiat.updateProvider).mockResolvedValue(provider)
  renderPage(<FiatPage />)
  await screen.findByText(/Yellow Card/)
  await userEvent.click(screen.getByRole('switch'))
  await waitFor(() => expect(adminApi.fiat.updateProvider).toHaveBeenCalledWith('yc', { is_enabled: false }))
})

test('fiat: force-settling a non-terminal intent needs a reason', async () => {
  vi.mocked(adminApi.fiat.intents).mockResolvedValue({ intents: [intent] })
  vi.mocked(adminApi.fiat.providers).mockResolvedValue({ providers: [] })
  vi.mocked(adminApi.fiat.forceSettle).mockResolvedValue(undefined)
  renderPage(<FiatPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'Settle' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.type(within(dialog).getByPlaceholderText('Why the manual override?'), 'stuck at provider')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(adminApi.fiat.forceSettle).toHaveBeenCalledWith('i1', 'stuck at provider'))
})
