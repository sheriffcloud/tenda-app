import { test, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderPage } from '../test-utils'
import PushPage from '@/app/(dashboard)/push/page'
import { adminApi } from '@/api/client'
import { toast } from 'sonner'

vi.mock('@/api/client', () => ({ adminApi: { push: { broadcast: vi.fn() } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const broadcast = vi.mocked(adminApi.push.broadcast)
const ok = vi.mocked(toast.success)

beforeEach(() => vi.clearAllMocks())

test('send is disabled until title and body are filled', async () => {
  renderPage(<PushPage />)
  const send = screen.getByRole('button', { name: 'Send broadcast…' })
  expect(send).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Title'), 'Heads up')
  await userEvent.type(screen.getByLabelText('Body'), 'Maintenance tonight')
  expect(send).toBeEnabled()
})

test('a non-"all" target reveals the target-value field', async () => {
  renderPage(<PushPage />)
  expect(screen.queryByLabelText('Country code')).toBeNull()
  await userEvent.selectOptions(screen.getByLabelText('Target'), 'country')
  expect(screen.getByLabelText('Country code')).toBeInTheDocument()
})

test('submitting opens a confirm dialog; confirming broadcasts and toasts the count', async () => {
  broadcast.mockResolvedValueOnce({ attempted: 1280 })
  renderPage(<PushPage />)
  await userEvent.type(screen.getByLabelText('Title'), 'Heads up')
  await userEvent.type(screen.getByLabelText('Body'), 'Maintenance tonight')
  await userEvent.click(screen.getByRole('button', { name: 'Send broadcast…' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Send now' }))
  await waitFor(() =>
    expect(broadcast).toHaveBeenCalledWith({ title: 'Heads up', body: 'Maintenance tonight', target: 'all' }),
  )
  expect(ok).toHaveBeenCalledWith('Broadcast queued to 1280 device tokens')
})
