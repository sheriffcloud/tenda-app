/**
 * The share action (#150): the share sheet where the browser has one, the
 * clipboard otherwise — and the reader closing the sheet is not a failure.
 *
 * jsdom ships no `navigator.share`, which is the desktop case; the sheet
 * cases install one per test and remove it after, so the order of tests
 * cannot leak a sheet into the clipboard cases.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { gigShareMessage } from '@tenda/shared'
import { ShareGigButton } from '@/components/gig/detail/ShareGigButton'
import { GIG_DETAIL_COPY } from '@/components/gig/detail/copy'
import { CLIPBOARD_COPY } from '@/components/ui/clipboard'
import { ToastHost, clearToastsForTests } from '@/components/ui/Toast'

const TITLE = 'Deliver a parcel to Yaba'
const URL = 'https://app.tendahq.com/gig/0d3a271a-0000-4000-8000-000000000000'
const MESSAGE = gigShareMessage(TITLE)

afterEach(() => {
  act(() => clearToastsForTests())
  // Restore the desktop shape: no share sheet.
  Reflect.deleteProperty(navigator, 'share')
})

/** Install a share sheet for one test; `Reflect.deleteProperty` above removes it. */
function installSheet(impl: (data: ShareData) => Promise<void>) {
  const share = vi.fn(impl)
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true })
  return share
}

function renderButton() {
  render(
    <>
      <ShareGigButton title={TITLE} url={URL} />
      <ToastHost />
    </>,
  )
  return screen.getByRole('button', { name: GIG_DETAIL_COPY.share })
}

test('without a share sheet, the sentence and the link go to the clipboard, and the toast says so', async () => {
  const user = userEvent.setup()
  await user.click(renderButton())
  expect(await navigator.clipboard.readText()).toBe(`${MESSAGE}\n${URL}`)
  expect(await screen.findByText(CLIPBOARD_COPY.copied(GIG_DETAIL_COPY.shareLinkLabel))).toBeInTheDocument()
})

test('with a share sheet, it is handed the sentence and the URL, and nothing is copied', async () => {
  const user = userEvent.setup()
  const share = installSheet(() => Promise.resolve())
  const writeText = vi.spyOn(navigator.clipboard, 'writeText')
  await user.click(renderButton())
  expect(share).toHaveBeenCalledWith({ title: MESSAGE, text: MESSAGE, url: URL })
  expect(writeText).not.toHaveBeenCalled()
  expect(screen.queryByText(/copied/)).toBeNull()
  writeText.mockRestore()
})

test('the reader closing the sheet is a dismissal: no clipboard, no toast', async () => {
  const user = userEvent.setup()
  installSheet(() => Promise.reject(new DOMException('closed', 'AbortError')))
  const writeText = vi.spyOn(navigator.clipboard, 'writeText')
  await user.click(renderButton())
  expect(writeText).not.toHaveBeenCalled()
  expect(screen.queryByText(/copied/)).toBeNull()
  expect(screen.queryByText(CLIPBOARD_COPY.failed)).toBeNull()
  writeText.mockRestore()
})

test('a sheet that refuses the payload falls back to the clipboard', async () => {
  const user = userEvent.setup()
  installSheet(() => Promise.reject(new TypeError('Invalid share data')))
  await user.click(renderButton())
  expect(await navigator.clipboard.readText()).toBe(`${MESSAGE}\n${URL}`)
  expect(await screen.findByText(CLIPBOARD_COPY.copied(GIG_DETAIL_COPY.shareLinkLabel))).toBeInTheDocument()
})

test('a denied clipboard with no sheet reads as a failure, not a silent success', async () => {
  const user = userEvent.setup()
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))
  await user.click(renderButton())
  expect(await screen.findByText(CLIPBOARD_COPY.failed)).toBeInTheDocument()
  expect(screen.queryByText(/copied/)).toBeNull()
  writeText.mockRestore()
})
