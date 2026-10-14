/**
 * The composer's wallet precondition (#59). Two things matter here and the
 * second is the one that was wrong before: WHAT it says, and WHEN it is
 * allowed to say anything at all.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  COMPOSER_WALLET_BODY,
  COMPOSER_WALLET_TITLE,
  COMPOSER_WALLET_UNAVAILABLE_TITLE,
} from '@tenda/shared'
import { ComposerWalletNotice } from '@/components/gig/gig-form/ComposerWalletNotice'

test('a settled account with no wallet is told BEFORE it fills anything', () => {
  render(<ComposerWalletNotice gate="needs_wallet" onRetry={vi.fn()} />)
  expect(screen.getByText(COMPOSER_WALLET_TITLE)).toBeInTheDocument()
  expect(screen.getByText(COMPOSER_WALLET_BODY)).toBeInTheDocument()
  // The way out is OFFERED, not taken — an automatic redirect is what lost
  // the filled form in the first place.
  expect(screen.getByRole('link', { name: 'Link a wallet' })).toHaveAttribute(
    'href',
    '/settings/linked-wallets',
  )
})

test('an account that CAN sign is told nothing', () => {
  const { container } = render(<ComposerWalletNotice gate="ok" onRetry={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()
})

test('while the answer is unknown the composer stays silent', () => {
  // The load-bearing case. 'unknown' covers both an unsettled wallet list and
  // a chain registry that has not landed, and in neither do we know enough to
  // tell someone they have no wallet.
  const { container } = render(<ComposerWalletNotice gate="unknown" onRetry={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()
})

test('a FAILED wallet load says so and offers a retry, never "link a wallet"', () => {
  const onRetry = vi.fn()
  render(<ComposerWalletNotice gate="unavailable" onRetry={onRetry} />)
  expect(screen.getByText(COMPOSER_WALLET_UNAVAILABLE_TITLE)).toBeInTheDocument()
  expect(screen.queryByText(COMPOSER_WALLET_TITLE)).not.toBeInTheDocument()
  // No link out either: the reader has not been shown to need one.
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(onRetry).toHaveBeenCalledTimes(1)
})

test('the notice is announced, not just drawn', () => {
  render(<ComposerWalletNotice gate="needs_wallet" onRetry={vi.fn()} />)
  expect(screen.getByRole('status')).toBeInTheDocument()
})
