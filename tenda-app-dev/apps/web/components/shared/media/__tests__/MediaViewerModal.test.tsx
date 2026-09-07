/**
 * Image lightbox: renders only for image items (documents open in a new
 * tab at the click site by design), closes via button and backdrop.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { MediaViewerModal } from '@/components/shared/media/MediaViewerModal'

test('renders the image with a working close button', async () => {
  const onClose = vi.fn()
  render(<MediaViewerModal item={{ id: 'a1', url: 'https://cdn/x.png', kind: 'image' }} onClose={onClose} />)
  expect(screen.getByAltText('Attachment')).toHaveAttribute('src', 'https://cdn/x.png')
  await userEvent.click(screen.getByRole('button', { name: 'Close viewer' }))
  expect(onClose).toHaveBeenCalled()
})

test('Escape closes the lightbox (DoD: Escape closes overlays)', async () => {
  const onClose = vi.fn()
  render(<MediaViewerModal item={{ id: 'a1', url: 'https://cdn/x.png', kind: 'image' }} onClose={onClose} />)
  await userEvent.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('null and document items render nothing', () => {
  const { rerender, container } = render(<MediaViewerModal item={null} onClose={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()
  rerender(<MediaViewerModal item={{ id: 'a2', url: 'https://cdn/d.pdf', kind: 'document' }} onClose={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()
})
