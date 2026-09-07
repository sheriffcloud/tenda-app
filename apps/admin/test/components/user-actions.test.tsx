import { test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserActions } from '@/components/users/user-actions'
import { adminApi, type AdminUserDetail } from '@/api/client'
import { setSession } from '@/lib/auth'

vi.mock('@/api/client', () => ({
  adminApi: {
    adminUsers: {
      updateStatus: vi.fn(),
      updateRole: vi.fn(),
      grantLoginEmail: vi.fn(),
      revokeLoginEmail: vi.fn(),
    },
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { updateStatus, updateRole, grantLoginEmail, revokeLoginEmail } = vi.mocked(adminApi.adminUsers)

function makeUser(over: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: 'u1', first_name: 'Ada', last_name: 'L', role: 'user', status: 'active',
    is_seeker: false, country: 'NG', city: 'Lagos', review_score: null,
    created_at: '2026-01-01', last_active_at: null, bio: null, avatar_url: null,
    phone_e164: null, advanced_mode_enabled: false,
    dispute_metric: { closed_engagements: 0, disputed: 0, dispute_rate_bps: null, fraud_flag: false },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setSession('jwt', { id: 'admin', role: 'super_admin', first_name: 'S', last_name: 'A' })
})

test('active non-admin user: Suspend opens confirm, confirming calls updateStatus(suspended)', async () => {
  updateStatus.mockResolvedValueOnce({ id: 'u1', status: 'suspended' })
  const onChanged = vi.fn()
  render(<UserActions user={makeUser()} onChanged={onChanged} />)
  await userEvent.click(screen.getByRole('button', { name: 'Suspend' }))
  // The dialog adds a second "Suspend" (confirm) — scope to the dialog.
  const dialog = await screen.findByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }))
  await waitFor(() => expect(updateStatus).toHaveBeenCalledWith('u1', 'suspended'))
  expect(onChanged).toHaveBeenCalled()
})

test('admin user cannot be suspended (button disabled + explanatory note)', () => {
  render(<UserActions user={makeUser({ role: 'dispute_admin' })} onChanged={() => {}} />)
  expect(screen.getByRole('button', { name: 'Suspend' })).toBeDisabled()
  expect(screen.getByText(/Admins cannot be suspended/)).toBeInTheDocument()
})

test('suspended user shows Reinstate, which calls updateStatus(active)', async () => {
  updateStatus.mockResolvedValueOnce({ id: 'u1', status: 'active' })
  render(<UserActions user={makeUser({ status: 'suspended' })} onChanged={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Reinstate' }))
  await waitFor(() => expect(updateStatus).toHaveBeenCalledWith('u1', 'active'))
})

test('role Apply is disabled until the role changes, then calls updateRole', async () => {
  updateRole.mockResolvedValueOnce({ id: 'u1', role: 'dispute_admin' })
  render(<UserActions user={makeUser({ role: 'user' })} onChanged={() => {}} />)
  const apply = screen.getByRole('button', { name: 'Apply' })
  expect(apply).toBeDisabled() // unchanged
  await userEvent.selectOptions(screen.getByRole('combobox'), 'dispute_admin')
  expect(apply).toBeEnabled()
  await userEvent.click(apply)
  await waitFor(() => expect(updateRole).toHaveBeenCalledWith('u1', 'dispute_admin'))
})

test('self-demotion to user is blocked (Apply stays disabled)', async () => {
  // session user id === the row id, demoting self to 'user'.
  render(<UserActions user={makeUser({ id: 'admin', role: 'super_admin' })} onChanged={() => {}} />)
  expect(screen.getByText(/You cannot demote your own account/)).toBeInTheDocument()
  await userEvent.selectOptions(screen.getByRole('combobox'), 'user')
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
})

test('admin user: grant login email calls grantLoginEmail and clears the field', async () => {
  grantLoginEmail.mockResolvedValueOnce({ user_id: 'u1', email: 'new@tenda.app', role: 'super_admin' })
  render(<UserActions user={makeUser({ role: 'super_admin' })} onChanged={() => {}} />)
  const input = screen.getByPlaceholderText('admin@tenda.app')
  expect(screen.getByRole('button', { name: 'Grant' })).toBeDisabled() // empty
  await userEvent.type(input, '  new@tenda.app  ')
  await userEvent.click(screen.getByRole('button', { name: 'Grant' }))
  await waitFor(() => expect(grantLoginEmail).toHaveBeenCalledWith('u1', 'new@tenda.app'))
  expect(input).toHaveValue('')
})

test('admin user: revoke login email calls revokeLoginEmail', async () => {
  revokeLoginEmail.mockResolvedValueOnce({ user_id: 'u1', revoked: true })
  render(<UserActions user={makeUser({ role: 'super_admin' })} onChanged={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  await waitFor(() => expect(revokeLoginEmail).toHaveBeenCalledWith('u1'))
})

test('non-admin user: no login-email controls, shows promote-first hint', () => {
  render(<UserActions user={makeUser({ role: 'user' })} onChanged={() => {}} />)
  expect(screen.queryByPlaceholderText('admin@tenda.app')).toBeNull()
  expect(screen.getByText(/Promote to an admin role first/)).toBeInTheDocument()
})
