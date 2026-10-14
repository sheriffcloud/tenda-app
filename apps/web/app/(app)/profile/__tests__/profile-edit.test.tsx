/**
 * /profile/edit — the round trip. Names and country/city go up, the store is
 * re-read rather than patched from the response, and the reader is returned
 * to their profile.
 *
 * The avatar leg is covered where the rule lives (lib/uploads): the browser
 * crop downscales to 512px before upload, so the server's 10MB cap is a
 * backstop rather than something the picker hits — mobile's FilePicker does
 * the same resize, so neither client rejects a large PHOTO, both reject a
 * large FILE at the upload seam.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

const { updateMeMock, refreshUserMock, pushMock, uploadMock, toastMock } = vi.hoisted(() => ({
  updateMeMock: vi.fn(),
  refreshUserMock: vi.fn(),
  pushMock: vi.fn(),
  uploadMock: vi.fn(),
  toastMock: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  api: { users: { updateMe: (...a: unknown[]) => updateMeMock(...a) } },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('@/lib/uploads/upload', () => ({ uploadToCloudinary: (...a: unknown[]) => uploadMock(...a) }))
vi.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => toastMock(...a) }))

import EditProfilePage from '@/app/(app)/profile/edit/page'
import type { User } from '@tenda/shared'
import { useAuthStore } from '@/stores/auth.store'

beforeEach(() => {
  updateMeMock.mockReset().mockResolvedValue({})
  refreshUserMock.mockReset().mockResolvedValue(undefined)
  pushMock.mockReset()
  uploadMock.mockReset()
  toastMock.mockReset()
  useAuthStore.setState({
    user: {
      id: 'u1',
      first_name: 'Ada',
      last_name: 'Lovelace',
      bio: '',
      country: 'NG',
      city: 'Lagos',
      avatar_url: null,
    } as User,
    refreshUser: refreshUserMock,
  })
})

test('seeds the form from the signed-in user', () => {
  render(<EditProfilePage />)
  expect(screen.getByDisplayValue('Ada')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Lovelace')).toBeInTheDocument()
})

test('a name edit round-trips: saved, re-read, and back to the profile', async () => {
  render(<EditProfilePage />)
  const first = screen.getByDisplayValue('Ada')
  await userEvent.clear(first)
  await userEvent.type(first, 'Grace')
  await userEvent.click(screen.getByRole('button', { name: /Save/ }))

  await waitFor(() =>
    expect(updateMeMock).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: 'Grace', last_name: 'Lovelace' }),
    ),
  )
  // The store holds the full row while updateMe answers a trimmed shape, so
  // the row is re-read rather than reconciled from the response.
  expect(refreshUserMock).toHaveBeenCalled()
  expect(pushMock).toHaveBeenCalledWith('/profile')
})

test('whitespace-only names are sent as undefined, not as blanks', async () => {
  render(<EditProfilePage />)
  const first = screen.getByDisplayValue('Ada')
  await userEvent.clear(first)
  await userEvent.type(first, '   ')
  await userEvent.click(screen.getByRole('button', { name: /Save/ }))
  await waitFor(() => expect(updateMeMock).toHaveBeenCalled())
  expect(updateMeMock.mock.calls[0][0].first_name).toBeUndefined()
})

test('no avatar picked means no upload is attempted', async () => {
  render(<EditProfilePage />)
  await userEvent.click(screen.getByRole('button', { name: /Save/ }))
  await waitFor(() => expect(updateMeMock).toHaveBeenCalled())
  expect(uploadMock).not.toHaveBeenCalled()
})

test('a failed save says so and keeps the reader on the form', async () => {
  updateMeMock.mockRejectedValue(new Error('Name is already taken'))
  render(<EditProfilePage />)
  await userEvent.click(screen.getByRole('button', { name: /Save/ }))
  await waitFor(() => expect(toastMock).toHaveBeenCalledWith('error', 'Name is already taken'))
  // Not navigated away — the edits are still there to correct.
  expect(pushMock).not.toHaveBeenCalled()
})
