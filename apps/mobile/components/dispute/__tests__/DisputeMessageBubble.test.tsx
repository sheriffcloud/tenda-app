/**
 * DisputeMessageBubble — sender label + timestamp are gated by the grouping
 * flags (showSender/showTime), each sender is named from its RESOLVED identity
 * (shared `resolveDisputeSender`), and "me" bubbles never render a label.
 *
 * The senders here are built with the real resolver rather than hand-written
 * objects: a bubble that renders a label the resolver would never produce is
 * not evidence of anything.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import { resolveDisputeSender, type DisputeMessage, type DossierParty } from '@tenda/shared'

const ACCENT = '#E08A3C'
const BRAND = '#2E5BD6'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { inset: '#eee' },
        content: { primary: '#000', tertiary: '#666' },
        brand: { primary: BRAND },
        accent: { primary: ACCENT },
      },
    },
  }),
}))
const mockTheme = { dark: false }
jest.mock('@/lib/theme', () => ({ useIsDark: () => mockTheme.dark }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/shared/media/AttachmentPreview', () => {
  const { Text, Pressable } = require('react-native')
  return {
    AttachmentPreview: ({ url, type, onPress }: { url: string; type: string; onPress: () => void }) => (
      <Pressable accessibilityLabel="preview" onPress={onPress}>
        <Text>{`${type}:${url}`}</Text>
      </Pressable>
    ),
  }
})

import { DisputeMessageBubble } from '@/components/dispute/DisputeMessageBubble'

const POSTER = 'user-poster'
const WORKER = 'user-worker'
const MEDIATOR = 'admin-mediator'

const PARTIES: DossierParty[] = [
  { role: 'creator', user_id: POSTER, first_name: 'Ada', last_name: 'Poster', raised_dispute: true },
  { role: 'counterparty', user_id: WORKER, first_name: 'Bola', last_name: 'Worker', raised_dispute: false },
]

/** Identity as the screen computes it, for a given sender and reader. */
const senderFrom = (senderId: string, viewerId: string, parties: DossierParty[] = PARTIES) =>
  resolveDisputeSender({ senderId, viewerId, kind: 'gig', parties })

const message: DisputeMessage = {
  id: 'm1',
  dispute_id: 'd1',
  sender_id: POSTER,
  body: 'The work was never delivered.',
  attachment_url: null,
  attachment_type: null,
  attachment_size: null,
  created_at: '2026-07-01T10:00:00.000Z',
}

test('party bubble at run start shows the role-qualified party name', () => {
  render(
    <DisputeMessageBubble message={message} sender={senderFrom(POSTER, WORKER)} showSender showTime />,
  )
  expect(screen.getByText('Poster · Ada Poster')).toBeTruthy()
  expect(screen.getByText('The work was never delivered.')).toBeTruthy()
})

test('a mediator reading the thread gets two DISTINCT party labels', () => {
  // The reported bug, at the component seam: both bubbles used to carry one
  // name because the screen passed a single "other party" string.
  render(
    <>
      <DisputeMessageBubble message={message} sender={senderFrom(POSTER, MEDIATOR)} showSender showTime />
      <DisputeMessageBubble
        message={{ ...message, id: 'm2', sender_id: WORKER, body: 'I delivered it.' }}
        sender={senderFrom(WORKER, MEDIATOR)}
        showSender
        showTime
      />
    </>,
  )
  expect(screen.getByText('Poster · Ada Poster')).toBeTruthy()
  expect(screen.getByText('Worker · Bola Worker')).toBeTruthy()
})

test('mediator bubble is labelled Mediator', () => {
  render(
    <DisputeMessageBubble message={message} sender={senderFrom(MEDIATOR, POSTER)} showSender showTime />,
  )
  expect(screen.getByText('Mediator')).toBeTruthy()
})

test('each party carries its own role accent; the mediator carries neither', () => {
  const { toJSON, rerender } = render(
    <DisputeMessageBubble message={message} sender={senderFrom(POSTER, MEDIATOR)} showSender showTime />,
  )
  expect(JSON.stringify(toJSON())).toContain(`"borderLeftColor":"${ACCENT}"`)

  rerender(
    <DisputeMessageBubble message={message} sender={senderFrom(WORKER, MEDIATOR)} showSender showTime />,
  )
  const counterparty = JSON.stringify(toJSON())
  expect(counterparty).toContain(`"borderLeftColor":"${BRAND}"`)
  expect(counterparty).not.toContain(ACCENT)

  rerender(
    <DisputeMessageBubble message={message} sender={senderFrom(MEDIATOR, POSTER)} showSender showTime />,
  )
  expect(JSON.stringify(toJSON())).toContain('"borderLeftColor":"transparent"')
})

test('every incoming bubble reserves the same edge, so text never shifts', () => {
  // A border participates in layout: if only party bubbles carried one, their
  // text would sit 3px right of the mediator bubbles interleaved with them.
  const widthOf = (json: string): string[] => json.match(/"borderLeftWidth":\d+/g) ?? []

  const { toJSON, rerender } = render(
    <DisputeMessageBubble message={message} sender={senderFrom(POSTER, MEDIATOR)} showSender showTime />,
  )
  const party = widthOf(JSON.stringify(toJSON()))

  rerender(
    <DisputeMessageBubble message={message} sender={senderFrom(MEDIATOR, POSTER)} showSender showTime />,
  )
  expect(widthOf(JSON.stringify(toJSON()))).toEqual(party)
  expect(party).toHaveLength(1)
})

test('continuation bubble (showSender=false) hides the sender label', () => {
  render(
    <DisputeMessageBubble
      message={message}
      sender={senderFrom(POSTER, WORKER)}
      showSender={false}
      showTime
    />,
  )
  expect(screen.queryByText('Poster · Ada Poster')).toBeNull()
})

test('my own bubble never shows a sender label and carries no role accent', () => {
  const { toJSON } = render(
    <DisputeMessageBubble message={message} sender={senderFrom(POSTER, POSTER)} showSender showTime />,
  )
  expect(screen.queryByText('You')).toBeNull()
  expect(screen.queryByText('Mediator')).toBeNull()
  // 'me' resolves with a role, but the accent is for the OTHER side's bubbles.
  expect(JSON.stringify(toJSON())).not.toContain('borderLeftColor')
})

test('showTime=false hides the timestamp', () => {
  const sender = senderFrom(POSTER, WORKER)
  const { rerender } = render(
    <DisputeMessageBubble message={message} sender={sender} showSender showTime={false} />,
  )
  expect(screen.getByText('Poster · Ada Poster')).toBeTruthy()
  rerender(<DisputeMessageBubble message={message} sender={sender} showSender showTime />)
  expect(screen.getByText('Poster · Ada Poster')).toBeTruthy()
})

test('a sender that cannot be placed yet falls back to a neutral label', () => {
  // No party list (context still in flight) — never a guessed "Mediator".
  render(
    <DisputeMessageBubble message={message} sender={senderFrom(POSTER, MEDIATOR, [])} showSender showTime />,
  )
  expect(screen.getByText('Participant')).toBeTruthy()
})

test('dark mode swaps both bubble tones', () => {
  mockTheme.dark = true
  try {
    const { toJSON, rerender } = render(
      <DisputeMessageBubble message={message} sender={senderFrom(POSTER, POSTER)} showSender showTime />,
    )
    expect(JSON.stringify(toJSON())).toContain('#3F5BA8') // my own bubble, dark

    rerender(
      <DisputeMessageBubble message={message} sender={senderFrom(POSTER, WORKER)} showSender showTime />,
    )
    expect(JSON.stringify(toJSON())).toContain('#1B2231') // their bubble, dark
  } finally {
    mockTheme.dark = false
  }
})

test('a message with BOTH an attachment and a body renders the two together', () => {
  const withBoth: DisputeMessage = {
    ...message,
    body: 'Receipt attached.',
    attachment_url: 'https://cdn/r.jpg',
    attachment_type: 'image',
    attachment_size: 1024,
  }
  render(<DisputeMessageBubble message={withBoth} sender={senderFrom(POSTER, WORKER)} showSender showTime />)
  expect(screen.getByText('image:https://cdn/r.jpg')).toBeTruthy()
  expect(screen.getByText('Receipt attached.')).toBeTruthy()
})

test('renders an attachment preview and forwards the tap payload', () => {
  const withFile: DisputeMessage = {
    ...message,
    body: '',
    attachment_url: 'https://cdn/e.pdf',
    attachment_type: 'file',
    attachment_size: 4096,
  }
  const onAttachmentPress = jest.fn()
  render(
    <DisputeMessageBubble
      message={withFile}
      sender={senderFrom(POSTER, WORKER)}
      onAttachmentPress={onAttachmentPress}
    />,
  )
  expect(screen.getByText('file:https://cdn/e.pdf')).toBeTruthy()
  fireEvent.press(screen.getByLabelText('preview'))
  expect(onAttachmentPress).toHaveBeenCalledWith({ id: 'm1', url: 'https://cdn/e.pdf', type: 'file' })
})

test('attachment-only message (empty body) renders no body text', () => {
  const attachmentOnly: DisputeMessage = {
    ...message,
    body: '',
    attachment_url: 'https://cdn/a.jpg',
    attachment_type: 'image',
    attachment_size: 2048,
  }
  render(<DisputeMessageBubble message={attachmentOnly} sender={senderFrom(POSTER, POSTER)} />)
  expect(screen.getByText('image:https://cdn/a.jpg')).toBeTruthy()
  expect(screen.queryByText('The work was never delivered.')).toBeNull()
})
