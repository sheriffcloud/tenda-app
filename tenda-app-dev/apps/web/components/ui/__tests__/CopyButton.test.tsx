/**
 * The copy affordance: raw value to the clipboard, feedback through the toast
 * layer, and the failure path when the clipboard is denied.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { CopyButton } from '@/components/ui/CopyButton'
import { ToastHost, clearToastsForTests } from '@/components/ui/Toast'

afterEach(() => {
  act(() => clearToastsForTests())
})

test('copies the RAW value and confirms through the toast', async () => {
  // userEvent.setup installs a real clipboard stub on jsdom's navigator.
  const user = userEvent.setup()
  render(
    <>
      <CopyButton value="0123456789" label="Account number" />
      <ToastHost />
    </>,
  )
  await user.click(screen.getByRole('button', { name: 'Copy account number' }))
  expect(await window.navigator.clipboard.readText()).toBe('0123456789')
  expect(await screen.findByText('Account number copied')).toBeInTheDocument()
})

test('a denied clipboard reads as a failure, not a silent success', async () => {
  const user = userEvent.setup()
  const writeText = vi
    .spyOn(window.navigator.clipboard, 'writeText')
    .mockRejectedValueOnce(new Error('denied'))
  render(
    <>
      <CopyButton value="secret" label="Reference" />
      <ToastHost />
    </>,
  )
  await user.click(screen.getByRole('button', { name: 'Copy reference' }))
  expect(await screen.findByText(/Could not copy/)).toBeInTheDocument()
  expect(screen.queryByText('Reference copied')).toBeNull()
  writeText.mockRestore()
})
