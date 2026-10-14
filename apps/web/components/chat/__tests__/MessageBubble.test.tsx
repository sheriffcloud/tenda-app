/**
 * Bubble rendering: mine vs theirs, the failed→Retry affordance, the
 * optimistic Sending line, and attachment click routing (image and file
 * both surface through onAttachmentPress with their type intact).
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { makeMessage } from '../../../test/factories/chat'

test('plain messages render their content; sending shows the status line', () => {
  render(
    <MessageBubble
      message={{ ...makeMessage({ id: 'm1', content: 'on my way' }), _status: 'sending' }}
      isMine
    />,
  )
  expect(screen.getByText('on my way')).toBeInTheDocument()
  expect(screen.getByText('Sending…')).toBeInTheDocument()
})

test('a failed send offers Retry and fires it', async () => {
  const onRetry = vi.fn()
  render(
    <MessageBubble
      message={{ ...makeMessage({ id: 'm1', content: 'lost' }), _status: 'failed' }}
      isMine
      onRetry={onRetry}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: /Didn't send/ }))
  expect(onRetry).toHaveBeenCalled()
})

test('an image attachment surfaces a typed press payload', async () => {
  const onPress = vi.fn()
  render(
    <MessageBubble
      message={makeMessage({
        id: 'm2',
        content: '',
        attachment_url: 'https://cdn/x.png',
        attachment_type: 'image',
        attachment_size: 10,
      })}
      isMine={false}
      onAttachmentPress={onPress}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'View image attachment' }))
  expect(onPress).toHaveBeenCalledWith({ id: 'm2', url: 'https://cdn/x.png', type: 'image' })
})

test('a file attachment renders the document chip and keeps its type on press', async () => {
  const onPress = vi.fn()
  render(
    <MessageBubble
      message={makeMessage({
        id: 'm3',
        content: 'see attached',
        attachment_url: 'https://cdn/doc.pdf',
        attachment_type: 'file',
        attachment_size: 99,
      })}
      isMine={false}
      onAttachmentPress={onPress}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Open document attachment' }))
  expect(onPress).toHaveBeenCalledWith({ id: 'm3', url: 'https://cdn/doc.pdf', type: 'file' })
  expect(screen.getByText('see attached')).toBeInTheDocument()
})
