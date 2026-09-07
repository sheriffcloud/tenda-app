/**
 * MessageBubble — attachment wiring: renders AttachmentPreview for a message
 * with an attachment and forwards taps as an onAttachmentPress payload the
 * screen turns into a viewer item. AttachmentPreview is stubbed to isolate the
 * bubble's own logic.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { LocalMessage } from '@/stores/chat.store'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { inset: '#eee', card: '#fff' },
        content: { primary: '#000', tertiary: '#666' },
        feedback: { danger: { base: '#f00' } },
      },
    },
  }),
}))
jest.mock('@/lib/theme', () => ({ useIsDark: () => false }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/shared/media/AttachmentPreview', () => {
  const { Text, Pressable } = require('react-native')
  return {
    AttachmentPreview: ({ url, type, onPress, onLongPress }: { url: string; type: string; onPress: () => void; onLongPress?: () => void }) => (
      <Pressable accessibilityLabel="preview" onPress={onPress} onLongPress={onLongPress}>
        <Text>{`${type}:${url}`}</Text>
      </Pressable>
    ),
  }
})

import { MessageBubble } from '@/components/chat/MessageBubble'

function msg(overrides: Partial<LocalMessage>): LocalMessage {
  return {
    id: 'm1',
    conversation_id: 'c1',
    sender_id: 'u1',
    escrow_id: null,
    escrow_title: null,
    escrow_kind: null,
    content: '',
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    read_at: null,
    created_at: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

it('renders AttachmentPreview and forwards the tap payload', () => {
  const onAttachmentPress = jest.fn()
  render(
    <MessageBubble
      message={msg({ attachment_url: 'https://cdn/a.jpg', attachment_type: 'image' })}
      isMine={false}
      onAttachmentPress={onAttachmentPress}
    />,
  )
  expect(screen.getByText('image:https://cdn/a.jpg')).toBeTruthy()
  fireEvent.press(screen.getByLabelText('preview'))
  expect(onAttachmentPress).toHaveBeenCalledWith({ id: 'm1', url: 'https://cdn/a.jpg', type: 'image' })
})

it('text-only message renders no attachment preview', () => {
  render(<MessageBubble message={msg({ content: 'hello' })} isMine />)
  expect(screen.getByText('hello')).toBeTruthy()
  expect(screen.queryByLabelText('preview')).toBeNull()
})

it('failed message shows a retry affordance that fires onRetry', () => {
  const onRetry = jest.fn()
  render(
    <MessageBubble message={msg({ content: 'oops', _status: 'failed' })} isMine onRetry={onRetry} />,
  )
  expect(screen.getByText('Retry')).toBeTruthy()
  fireEvent.press(screen.getByLabelText('Retry sending message'))
  expect(onRetry).toHaveBeenCalled()
})

it('sending message shows a sending indicator', () => {
  render(<MessageBubble message={msg({ content: 'wait', _status: 'sending' })} isMine />)
  expect(screen.getByText('Sending…')).toBeTruthy()
})

it('long-press on a counterparty message fires onLongPress (report)', () => {
  const onLongPress = jest.fn()
  render(<MessageBubble message={msg({ content: 'hi' })} isMine={false} onLongPress={onLongPress} />)
  fireEvent(screen.getByText('hi'), 'longPress')
  expect(onLongPress).toHaveBeenCalled()
})

it('image-only counterparty message stays reportable via the preview long-press', () => {
  const onLongPress = jest.fn()
  render(
    <MessageBubble
      message={msg({ attachment_url: 'https://cdn/a.jpg', attachment_type: 'image' })}
      isMine={false}
      onLongPress={onLongPress}
    />,
  )
  fireEvent(screen.getByLabelText('preview'), 'longPress')
  expect(onLongPress).toHaveBeenCalled()
})
