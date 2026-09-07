import { test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import LoginPage from '@/app/login/page'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { toast } from 'sonner'

vi.mock('@/api/client', () => ({ adminApi: { auth: { sendEmailOtp: vi.fn(), verifyEmailOtp: vi.fn() } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const sendOtp = vi.mocked(adminApi.auth.sendEmailOtp)
const verifyOtp = vi.mocked(adminApi.auth.verifyEmailOtp)
const ok = vi.mocked(toast.success)
const err = vi.mocked(toast.error)
// eslint-disable-next-line react-hooks/rules-of-hooks -- retrieves the stub from the setup mock, not a hook call
const router = vi.mocked(useRouter())

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

test('email step: sending a code advances to the code step', async () => {
  sendOtp.mockResolvedValueOnce({ sent: true, expires_in: 600 })
  render(<LoginPage />)
  await userEvent.type(screen.getByLabelText('Email'), 'admin@tenda.app')
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }))
  await waitFor(() => expect(sendOtp).toHaveBeenCalledWith({ email: 'admin@tenda.app' }))
  expect(ok).toHaveBeenCalled()
  expect(await screen.findByLabelText('One-time code')).toBeInTheDocument()
})

test('email step: a send failure surfaces an error and stays put', async () => {
  sendOtp.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'smtp down'))
  render(<LoginPage />)
  await userEvent.type(screen.getByLabelText('Email'), 'admin@tenda.app')
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }))
  await waitFor(() => expect(err).toHaveBeenCalledWith('smtp down'))
  expect(screen.queryByLabelText('One-time code')).toBeNull()
})

test('code step: a valid code sets the session and routes to /disputes', async () => {
  sendOtp.mockResolvedValueOnce({ sent: true, expires_in: 600 })
  verifyOtp.mockResolvedValueOnce({
    token: 'jwt-9', token_ttl: '12h',
    user: { id: 'a1', role: 'super_admin', first_name: 'S', last_name: 'A' },
  })
  render(<LoginPage />)
  await userEvent.type(screen.getByLabelText('Email'), 'admin@tenda.app')
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }))
  await userEvent.type(await screen.findByLabelText('One-time code'), '123456')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith({ email: 'admin@tenda.app', code: '123456' }))
  expect(localStorage.getItem('tenda_admin_token')).toBe('jwt-9')
  expect(router.push).toHaveBeenCalledWith('/disputes')
})

test('code step: a wrong code toasts the error and does not navigate', async () => {
  sendOtp.mockResolvedValueOnce({ sent: true, expires_in: 600 })
  verifyOtp.mockRejectedValueOnce(new ApiError(401, 'OTP_INVALID', 'wrong code'))
  render(<LoginPage />)
  await userEvent.type(screen.getByLabelText('Email'), 'admin@tenda.app')
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }))
  await userEvent.type(await screen.findByLabelText('One-time code'), '000000')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() => expect(err).toHaveBeenCalledWith('wrong code'))
  expect(router.push).not.toHaveBeenCalled()
})

test('"Use a different email" returns to the email step', async () => {
  sendOtp.mockResolvedValueOnce({ sent: true, expires_in: 600 })
  render(<LoginPage />)
  await userEvent.type(screen.getByLabelText('Email'), 'admin@tenda.app')
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Use a different email' }))
  expect(screen.getByLabelText('Email')).toBeInTheDocument()
  expect(screen.queryByLabelText('One-time code')).toBeNull()
})
