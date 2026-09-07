/**
 * Dispute-mediation thread — WHO each bubble is attributed to, from every
 * seat that can open this screen. The screen used to derive that from "the
 * party that isn't me" plus the CURRENT claim holder, which produced three
 * distinct mislabellings (A, C and D below); the identity now comes from the
 * shared resolver keyed on party membership.
 *
 * The bubble is mocked so each case asserts the identity the SCREEN computed,
 * not how the bubble happens to paint it — the bubble has its own suite.
 *
 * ── Harness note, learned the hard way ──────────────────────────────────────
 * `jest.mock` factories are hoisted above this module's own declarations, and
 * babel compiles the `const`s they close over to `var`. Any id referenced from
 * a fixture that a factory returns therefore reads back as `undefined` at
 * fixture-construction time — silently, with no TDZ error, and JSON.stringify
 * simply drops the key. An earlier version of this file "passed" while every
 * message carried `sender_id: undefined`, which made all four cases look
 * identical and proved nothing. Ids below are inline literals for that reason.
 * Do not replace them with the constants.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { DisputeMessage, DisputeSender, DisputeThreadResponse } from '@tenda/shared'
import type { DisputeSendResult } from '@/lib/dispute-send-error'

const CREATOR = 'user-creator-1111'
const COUNTERPARTY = 'user-counterparty-2222'
const MEDIATOR = 'admin-mediator-3333'
const SECOND_MEDIATOR = 'admin-second-mediator-8888'

/** Mutated per case. A plain `let` would NOT propagate — see the header note. */
const mockState: {
  myId: string
  assigned: string | null
  withContext: boolean
  hasEscrowId: boolean
  signedIn: boolean
  backs: number
} = {
  myId: MEDIATOR,
  assigned: MEDIATOR,
  withContext: true,
  hasEscrowId: true,
  signedIn: true,
  backs: 0,
}
const mockBubbles: Array<{ id: string; sender: DisputeSender }> = []

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { inset: '#eee' },
        content: { primary: '#000', secondary: '#444', tertiary: '#666' },
        brand: { primary: '#2E5BD6' },
        accent: { primary: '#E08A3C' },
        border: { subtle: '#ddd' },
        feedback: { danger: { base: '#f00' } },
      },
    },
  }),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => (mockState.hasEscrowId ? { escrowId: 'escrow-1' } : {}),
  useRouter: () => ({
    back: () => {
      mockState.backs += 1
    },
    push: jest.fn(),
  }),
}))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user: mockState.signedIn ? { id: mockState.myId } : null }),
}))
jest.mock('@/hooks/useKeyboardHeight', () => ({ useKeyboardHeight: () => 0 }))

/**
 * Upload plumbing. The screen owns the `onUploaded` callback, so the mock
 * captures it: that is the only way to exercise "attachment uploaded → posted
 * as a message" without a real picker.
 */
const mockUpload: {
  uploading: boolean
  picked: string[]
  onUploaded: ((a: { url: string; type: string; size: number }) => Promise<void>) | null
} = { uploading: false, picked: [], onUploaded: null }

jest.mock('@/hooks/useAttachmentUpload', () => ({
  useAttachmentUpload: (args: {
    onUploaded: (a: { url: string; type: string; size: number }) => Promise<void>
  }) => {
    mockUpload.onUploaded = args.onUploaded
    return {
      uploading: mockUpload.uploading,
      pick: (kind: string) => {
        mockUpload.picked.push(kind)
      },
    }
  },
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/ScreenContainer', () => {
  const { View } = require('react-native')
  return { ScreenContainer: ({ children }: { children: React.ReactNode }) => <View>{children}</View> }
})
jest.mock('@/components/ui/Header', () => {
  const { View, Pressable, Text } = require('react-native')
  return {
    Header: ({ title, onBackPress }: { title: string; onBackPress: () => void }) => (
      <View>
        <Text>{title}</Text>
        <Pressable testID="back" onPress={onBackPress} />
      </View>
    ),
  }
})
// Interactive stubs: each exposes the callback the screen wires into it, so
// the send / attach / retry paths are exercised rather than merely rendered.
jest.mock('@/components/ui/ChatInput', () => {
  const { View, Pressable } = require('react-native')
  return {
    ChatInput: ({
      onSend,
      onAttach,
      disabled,
    }: {
      onSend: (t: string) => void
      onAttach: () => void
      disabled?: boolean
    }) => (
      <View testID="chat-input">
        <Pressable testID="send" onPress={() => onSend('my side of the story')} />
        <Pressable testID="attach" onPress={onAttach} />
        {disabled === true && <View testID="composer-disabled" />}
      </View>
    ),
  }
})
jest.mock('@/components/shared/AttachSheet', () => {
  const { View, Pressable } = require('react-native')
  return {
    AttachSheet: ({
      visible,
      onPick,
      onClose,
    }: {
      visible: boolean
      onPick: (k: string) => void
      onClose: () => void
    }) =>
      visible ? (
        <View testID="attach-sheet">
          <Pressable testID="pick-image" onPress={() => onPick('image')} />
          <Pressable testID="close-sheet" onPress={onClose} />
        </View>
      ) : null,
  }
})
jest.mock('@/components/shared/media/MediaViewerModal', () => {
  const { View, Pressable, Text } = require('react-native')
  return {
    MediaViewerModal: ({
      item,
      onClose,
    }: {
      item: { id: string } | null
      onClose: () => void
    }) =>
      item === null ? null : (
        <View testID="viewer">
          <Text>{item.id}</Text>
          <Pressable testID="close-viewer" onPress={onClose} />
        </View>
      ),
  }
})
jest.mock('@/components/feedback', () => {
  const { View, Pressable, Text } = require('react-native')
  return {
    ErrorState: ({ title, onCtaPress }: { title: string; onCtaPress: () => void }) => (
      <View testID="error-state">
        <Text>{title}</Text>
        <Pressable testID="retry" onPress={onCtaPress} />
      </View>
    ),
  }
})
jest.mock('@/components/feedback/LoadingScreen', () => {
  const { View } = require('react-native')
  return { LoadingScreen: () => <View testID="loading" /> }
})

const mockToasts: Array<{ tone: string; message: string }> = []
jest.mock('@/components/ui/Toast', () => ({
  showToast: (tone: string, message: string) => {
    mockToasts.push({ tone, message })
  },
}))
jest.mock('@/components/chat/ChatTimestampGroup', () => {
  const { View } = require('react-native')
  return { ChatTimestampGroup: () => <View /> }
})
jest.mock('@/components/dispute/DisputeContextHeader', () => {
  const { View } = require('react-native')
  return { DisputeContextHeader: () => <View testID="context-header" /> }
})
jest.mock('@/components/dispute/DisputeMessageBubble', () => {
  const { View, Pressable } = require('react-native')
  return {
    DisputeMessageBubble: (props: {
      message: { id: string }
      sender: DisputeSender
      onAttachmentPress?: (a: { id: string; url: string; type: string }) => void
    }) => {
      mockBubbles.push({ id: props.message.id, sender: props.sender })
      return (
        <View>
          <Pressable
            testID={`open-attachment-${props.message.id}`}
            onPress={() =>
              props.onAttachmentPress?.({
                id: props.message.id,
                url: 'https://res.cloudinary.com/x/evidence.jpg',
                type: 'image',
              })
            }
          />
        </View>
      )
    },
  }
})

// Bubbles are keyed by message ID, not body: the ids here are inline literals
// (see the header note), so the lookup cannot silently miss the way a shared
// string constant would.
const POSTER_MSG_ID = 'm1'
const EX_MEDIATOR_MSG_ID = 'm2'
const WORKER_MSG_ID = 'm3'

const messages: DisputeMessage[] = [
  {
    id: 'm1',
    dispute_id: 'd1',
    sender_id: 'user-creator-1111',
    body: 'I paid for this gig.',
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    created_at: '2026-07-01T10:00:00.000Z',
  },
  {
    id: 'm2',
    dispute_id: 'd1',
    sender_id: 'admin-first-mediator-9999',
    body: 'Mediator here, reviewing the evidence.',
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    created_at: '2026-07-01T10:30:00.000Z',
  },
  {
    id: 'm3',
    dispute_id: 'd1',
    sender_id: 'user-counterparty-2222',
    body: 'I delivered the work.',
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    created_at: '2026-07-01T11:00:00.000Z',
  },
]

const context: DisputeThreadResponse['context'] = {
  kind: 'gig',
  status: 'disputed',
  chain_id: 'solana:devnet',
  asset: 'USDC',
  amount_raw: '1000000',
  subject_title: 'Fix my sink',
  parties: [
    {
      role: 'creator',
      user_id: 'user-creator-1111',
      first_name: 'Ada',
      last_name: 'Poster',
      raised_dispute: true,
    },
    {
      role: 'counterparty',
      user_id: 'user-counterparty-2222',
      first_name: 'Bola',
      last_name: 'Worker',
      raised_dispute: false,
    },
  ],
  reason: 'Work not delivered',
  raised_at: '2026-07-01T09:00:00.000Z',
  winner: null,
  resolved_at: null,
}

/**
 * Thread-hook state. Plain functions rather than jest.fn(): `clearMocks` wipes
 * mock implementations between tests, which would quietly turn `send` into a
 * call returning undefined and make the failure-toast assertions vacuous.
 */
const mockThread: {
  loading: boolean
  error: string | null
  readOnly: boolean
  /** What the hook reports back from send(); 'sent' is success. */
  sendResult: DisputeSendResult
  /** Thread missing with no error string — the other half of the load guard. */
  threadMissing: boolean
  /** Drive the ListEmptyComponent without mutating the shared message fixture. */
  empty: boolean
  sent: Array<{ body: string; hasAttachment: boolean }>
  reloads: number
} = {
  loading: false,
  error: null,
  readOnly: false,
  sendResult: 'sent',
  threadMissing: false,
  empty: false,
  sent: [],
  reloads: 0,
}

jest.mock('@/hooks/useDisputeThread', () => ({
  useDisputeThread: () => ({
    loading: mockThread.loading,
    error: mockThread.error,
    thread:
      mockThread.error !== null || mockThread.threadMissing
        ? null
        : {
            dispute_id: 'd1',
            escrow_id: 'escrow-1',
            assigned_to_id: mockState.assigned,
            read_only: mockThread.readOnly,
            reads: [],
            context: mockState.withContext ? context : null,
          },
    messages: mockThread.empty ? [] : messages,
    send: (body: string, attachment?: unknown) => {
      mockThread.sent.push({ body, hasAttachment: attachment !== undefined })
      return Promise.resolve(mockThread.sendResult)
    },
    reload: () => {
      mockThread.reloads += 1
      return Promise.resolve()
    },
  }),
}))

import DisputeThreadScreen from '@/app/dispute/[escrowId]'

interface Seat {
  myId: string
  assigned: string | null
  withContext?: boolean
}

interface SeenSenders {
  poster: DisputeSender
  worker: DisputeSender
  exMediator: DisputeSender
}

/** Resolved senders from what the screen actually rendered, keyed by message. */
function seenSenders(): SeenSenders {
  const byId = new Map(mockBubbles.map((b) => [b.id, b.sender]))
  const pick = (id: string): DisputeSender => {
    const found = byId.get(id)
    // Loud on purpose: a missing bubble means the fixture never reached the
    // list, which is exactly how a hoisting slip would fake a green run.
    if (found === undefined) throw new Error(`no bubble rendered for message ${id}`)
    return found
  }
  return {
    poster: pick(POSTER_MSG_ID),
    worker: pick(WORKER_MSG_ID),
    exMediator: pick(EX_MEDIATOR_MSG_ID),
  }
}

/** Render from one seat and read back the identity the screen computed. */
function labelsFrom({ myId, assigned, withContext = true }: Seat): SeenSenders {
  mockState.myId = myId
  mockState.assigned = assigned
  mockState.withContext = withContext
  render(<DisputeThreadScreen />)
  return seenSenders()
}

beforeEach(() => {
  // Every mutable fixture resets HERE, not in the render helpers: a seat left
  // over from the previous case is exactly the kind of cross-test bleed that
  // made four different perspectives look identical while proving nothing.
  mockBubbles.length = 0
  mockState.myId = MEDIATOR
  mockState.assigned = MEDIATOR
  mockState.withContext = true
  context.kind = 'gig'
  mockThread.loading = false
  mockThread.error = null
  mockThread.readOnly = false
  mockThread.sendResult = 'sent'
  mockThread.threadMissing = false
  mockThread.empty = false
  mockThread.sent.length = 0
  mockThread.reloads = 0
  mockUpload.uploading = false
  mockUpload.picked.length = 0
  mockUpload.onUploaded = null
  mockToasts.length = 0
  mockState.hasEscrowId = true
  mockState.signedIn = true
  mockState.backs = 0
})

test('A) a MEDIATOR admin tells the two disputants apart', () => {
  // THE reported bug: both party bubbles used to read "Ada Poster".
  const seen = labelsFrom({ myId: MEDIATOR, assigned: MEDIATOR })

  expect(seen.poster.label).toBe('Poster · Ada Poster')
  expect(seen.worker.label).toBe('Worker · Bola Worker')
  expect(seen.poster.label).not.toBe(seen.worker.label)
  expect(seen.poster.role).toBe('creator')
  expect(seen.worker.role).toBe('counterparty')
  // Neither disputant may be dressed as the mediator to the mediator.
  expect(seen.poster.kind).toBe('party')
  expect(seen.worker.kind).toBe('party')
})

test('B) a party sees itself, its counterparty, and the admin voice', () => {
  const seen = labelsFrom({ myId: CREATOR, assigned: MEDIATOR })

  expect(seen.poster.kind).toBe('me')
  expect(seen.worker.label).toBe('Worker · Bola Worker')
  expect(seen.exMediator.label).toBe('Mediator')
})

test('C) a party holding the claim is NOT dressed up as the mediator', () => {
  // An admin who is also a disputant: the counterparty must see their
  // opponent as the poster, not as the neutral arbiter.
  const seen = labelsFrom({ myId: COUNTERPARTY, assigned: CREATOR })

  expect(seen.poster.kind).toBe('party')
  expect(seen.poster.label).toBe('Poster · Ada Poster')
  expect(seen.worker.kind).toBe('me')
})

test('D) a previous mediator survives a claim handoff', () => {
  // Released and re-claimed by a colleague: the first mediator's messages
  // used to be attributed to the reader's OPPONENT.
  const seen = labelsFrom({ myId: COUNTERPARTY, assigned: SECOND_MEDIATOR })

  expect(seen.exMediator.kind).toBe('mediator')
  expect(seen.exMediator.label).toBe('Mediator')
  expect(seen.poster.label).toBe('Poster · Ada Poster')
})

test('E) an unclaimed dispute still names both parties', () => {
  const seen = labelsFrom({ myId: MEDIATOR, assigned: null })

  expect(seen.poster.label).toBe('Poster · Ada Poster')
  expect(seen.worker.label).toBe('Worker · Bola Worker')
  expect(seen.exMediator.label).toBe('Mediator')
})

test('F) with no context yet, senders are neutral rather than guessed', () => {
  const seen = labelsFrom({ myId: COUNTERPARTY, assigned: MEDIATOR, withContext: false })

  expect(seen.poster.kind).toBe('unknown')
  expect(seen.poster.label).toBe('Participant')
  // The reader is still identifiable without a party list.
  expect(seen.worker.kind).toBe('me')
})

test('G) exchange escrows use the maker/taker vocabulary', () => {
  context.kind = 'exchange'
  const seen = labelsFrom({ myId: MEDIATOR, assigned: MEDIATOR })
  expect(seen.poster.label).toBe('Maker · Ada Poster')
  expect(seen.worker.label).toBe('Taker · Bola Worker')
})

test('H) a resolved thread drops the composer but keeps attribution', () => {
  mockThread.readOnly = true
  const { queryByTestId } = render(<DisputeThreadScreen />)

  expect(queryByTestId('chat-input')).toBeNull()
  const seen = seenSenders()
  expect(seen.poster.label).toBe('Poster · Ada Poster')
  expect(seen.worker.label).toBe('Worker · Bola Worker')
})

// ── screen plumbing: load states, composing, evidence ───────────────────────

/** Mount as an ordinary disputant; the seat is irrelevant to these paths. */
function renderAsParty(): void {
  mockState.myId = COUNTERPARTY
  mockState.assigned = MEDIATOR
  render(<DisputeThreadScreen />)
}

test('the thread shows a loading screen before the first load lands', () => {
  mockThread.loading = true
  renderAsParty()
  expect(screen.getByTestId('loading')).toBeTruthy()
  expect(screen.queryByTestId('chat-input')).toBeNull()
})

test('a failed load surfaces the server message and retries on demand', () => {
  mockThread.error = 'Dispute thread unavailable'
  renderAsParty()

  expect(screen.getByText('Dispute thread unavailable')).toBeTruthy()
  fireEvent.press(screen.getByTestId('retry'))
  expect(mockThread.reloads).toBe(1)
})

test('a load that yields no thread still offers a retry', () => {
  // `error` is null but the thread is missing — the second half of the guard.
  mockThread.error = ''
  renderAsParty()
  expect(screen.getByTestId('error-state')).toBeTruthy()
})

test('sending posts the composed text', async () => {
  renderAsParty()
  fireEvent.press(screen.getByTestId('send'))
  await Promise.resolve()

  expect(mockThread.sent).toEqual([{ body: 'my side of the story', hasAttachment: false }])
  expect(mockToasts).toHaveLength(0)
})

test('a failed send tells the user rather than dropping the message silently', async () => {
  mockThread.sendResult = 'failed'
  renderAsParty()
  fireEvent.press(screen.getByTestId('send'))
  await Promise.resolve()

  expect(mockToasts).toEqual([{ tone: 'error', message: 'Message not sent, try again' }])
})

test('attaching opens the sheet and forwards the picked kind', () => {
  renderAsParty()
  expect(screen.queryByTestId('attach-sheet')).toBeNull()

  fireEvent.press(screen.getByTestId('attach'))
  fireEvent.press(screen.getByTestId('pick-image'))

  expect(mockUpload.picked).toEqual(['image'])
  expect(screen.queryByTestId('attach-sheet')).toBeNull() // picking closes it
})

test('the attach sheet closes without picking', () => {
  renderAsParty()
  fireEvent.press(screen.getByTestId('attach'))
  fireEvent.press(screen.getByTestId('close-sheet'))

  expect(screen.queryByTestId('attach-sheet')).toBeNull()
  expect(mockUpload.picked).toEqual([])
})

test('an uploaded attachment is posted as an attachment-only message', async () => {
  renderAsParty()
  const onUploaded = mockUpload.onUploaded
  if (onUploaded === null) throw new Error('the screen never registered an upload handler')

  await onUploaded({ url: 'https://res.cloudinary.com/x/a.jpg', type: 'image', size: 2048 })

  expect(mockThread.sent).toEqual([{ body: '', hasAttachment: true }])
  expect(mockToasts).toHaveLength(0)
})

test('a failed attachment send is reported', async () => {
  mockThread.sendResult = 'failed'
  renderAsParty()
  const onUploaded = mockUpload.onUploaded
  if (onUploaded === null) throw new Error('the screen never registered an upload handler')

  await onUploaded({ url: 'https://res.cloudinary.com/x/a.jpg', type: 'image', size: 2048 })

  expect(mockToasts).toEqual([{ tone: 'error', message: 'Attachment not sent, try again' }])
})

test('the composer is disabled while an upload is in flight', () => {
  mockUpload.uploading = true
  renderAsParty()
  expect(screen.getByTestId('composer-disabled')).toBeTruthy()
})

test('tapping evidence opens the viewer, and it closes again', () => {
  renderAsParty()
  expect(screen.queryByTestId('viewer')).toBeNull()

  fireEvent.press(screen.getByTestId('open-attachment-m1'))
  expect(screen.getByTestId('viewer')).toBeTruthy()
  expect(screen.getByText('m1')).toBeTruthy()

  fireEvent.press(screen.getByTestId('close-viewer'))
  expect(screen.queryByTestId('viewer')).toBeNull()
})

test('a signed-out reader owns no bubble', () => {
  // `user` is null before hydration; an empty viewer id must not claim a
  // message as "me" — every sender is somebody else.
  mockState.signedIn = false
  renderAsParty()
  const seen = seenSenders()
  expect(seen.poster.kind).toBe('party')
  expect(seen.worker.kind).toBe('party')
  expect(seen.exMediator.kind).toBe('mediator')
})

test('a route with no escrow id degrades instead of throwing', () => {
  mockState.hasEscrowId = false
  mockThread.threadMissing = true
  renderAsParty()
  expect(screen.getByTestId('error-state')).toBeTruthy()
})

test('a missing thread with no error message uses the default copy', () => {
  mockThread.threadMissing = true
  renderAsParty()
  expect(screen.getByText('Could not load the dispute thread')).toBeTruthy()
})

test('back navigates away from both the thread and the error state', () => {
  renderAsParty()
  fireEvent.press(screen.getByTestId('back'))
  expect(mockState.backs).toBe(1)

  mockThread.threadMissing = true
  renderAsParty()
  fireEvent.press(screen.getByTestId('back'))
  expect(mockState.backs).toBe(2)
})

// ── seat-aware copy + composer ──────────────────────────────────────────────
// Every string on this screen used to address a disputant, including for the
// mediating admin who arrives via the push deep-link. The seat is derived from
// party MEMBERSHIP (shared `disputeViewerSeat`) — the app has no admin role of
// its own — and the composer follows the server's rule that read access alone
// grants no voice.

const MEDIATOR_BANNER = /viewing this as a mediator/i
const PARTY_BANNER = /An admin will join this conversation shortly/i

test('a mediator WITHOUT the claim is told to claim it, and gets no composer', () => {
  // The dead end this fixes: read access without a voice, and copy promising
  // that an admin is on the way — to the admin.
  mockState.myId = MEDIATOR
  mockState.assigned = null
  render(<DisputeThreadScreen />)

  expect(screen.getByText(MEDIATOR_BANNER)).toBeTruthy()
  expect(screen.queryByText(PARTY_BANNER)).toBeNull()
  expect(screen.queryByTestId('chat-input')).toBeNull()
})

test('a mediator reading a COLLEAGUE’s case is equally voiceless', () => {
  // Gated on "do I hold the claim", not "is it unclaimed" — the second admin
  // could post just as little, and used to see no banner at all.
  mockState.myId = MEDIATOR
  mockState.assigned = SECOND_MEDIATOR
  render(<DisputeThreadScreen />)

  expect(screen.getByText(MEDIATOR_BANNER)).toBeTruthy()
  expect(screen.queryByTestId('chat-input')).toBeNull()
})

test('a mediator HOLDING the claim gets the composer and no banner', () => {
  mockState.myId = MEDIATOR
  mockState.assigned = MEDIATOR
  render(<DisputeThreadScreen />)

  expect(screen.queryByText(MEDIATOR_BANNER)).toBeNull()
  expect(screen.getByTestId('chat-input')).toBeTruthy()
})

test('a disputant keeps the original copy and their composer', () => {
  mockState.myId = CREATOR
  mockState.assigned = null
  render(<DisputeThreadScreen />)

  expect(screen.getByText(PARTY_BANNER)).toBeTruthy()
  expect(screen.queryByText(MEDIATOR_BANNER)).toBeNull()
  expect(screen.getByTestId('chat-input')).toBeTruthy()
})

test('a disputant on a CLAIMED dispute sees neither banner but can still post', () => {
  mockState.myId = CREATOR
  mockState.assigned = MEDIATOR
  render(<DisputeThreadScreen />)

  expect(screen.queryByText(PARTY_BANNER)).toBeNull()
  expect(screen.queryByText(MEDIATOR_BANNER)).toBeNull()
  expect(screen.getByTestId('chat-input')).toBeTruthy()
})

test('with no party list yet, a disputant is NOT silenced', () => {
  // Fail-open: a tail poll before the context lands leaves the seat unknown.
  // Guessing "mediator" there would strip a real disputant's composer
  // mid-conversation, which is far worse than showing them stale copy.
  mockState.myId = CREATOR
  mockState.assigned = null
  mockState.withContext = false
  render(<DisputeThreadScreen />)

  expect(screen.getByTestId('chat-input')).toBeTruthy()
  expect(screen.queryByText(MEDIATOR_BANNER)).toBeNull()
})

test('the empty state prompts a disputant to speak but not the mediator', () => {
  mockThread.empty = true
  mockState.myId = CREATOR
  mockState.assigned = MEDIATOR
  const party = render(<DisputeThreadScreen />)
  expect(party.getByText(/Explain your side/i)).toBeTruthy()
  party.unmount()

  mockState.myId = MEDIATOR
  render(<DisputeThreadScreen />)
  expect(screen.getByText('No messages yet.')).toBeTruthy()
  expect(screen.queryByText(/Explain your side/i)).toBeNull()
})

test('a resolved thread shows no mediator banner even without the claim', () => {
  // read_only already drops the composer; a "claim it to reply" nudge on a
  // closed case would be a dead end of its own.
  mockThread.readOnly = true
  mockState.myId = MEDIATOR
  mockState.assigned = null
  render(<DisputeThreadScreen />)

  expect(screen.queryByText(MEDIATOR_BANNER)).toBeNull()
  expect(screen.getByText(/resolved, the conversation is read-only/i)).toBeTruthy()
})

// ── send refusals reach the user with their real reason ─────────────────────
// Every failure used to collapse to "Message not sent, try again", which told
// an admin without the claim, and anyone posting to a resolved thread, to keep
// retrying something that could never succeed.

test('each refusal reason produces its OWN message, and only one says try again', async () => {
  const seen = new Map<DisputeSendResult, string>()
  for (const result of ['resolved', 'not_claimed', 'invalid', 'rate_limited', 'failed'] as const) {
    mockToasts.length = 0
    mockThread.sendResult = result
    const view = render(<DisputeThreadScreen />)
    fireEvent.press(screen.getByTestId('send'))
    await Promise.resolve()
    expect(mockToasts).toHaveLength(1)
    seen.set(result, mockToasts[0].message)
    view.unmount()
  }

  // Distinct copy per reason — a shared string is the bug this replaces.
  expect(new Set(seen.values()).size).toBe(seen.size)
  expect(seen.get('failed')).toMatch(/try again/i)
  for (const result of ['resolved', 'not_claimed', 'invalid', 'rate_limited'] as const) {
    expect(seen.get(result)).not.toMatch(/try again/i)
  }
})

test('a refused attachment names the ATTACHMENT, not the message', async () => {
  mockThread.sendResult = 'failed'
  renderAsParty()
  await mockUpload.onUploaded?.({ url: 'https://cdn/x.jpg', type: 'image', size: 10 })

  expect(mockToasts).toEqual([{ tone: 'error', message: 'Attachment not sent, try again' }])
})

test('an attachment refused for a NON-retryable reason drops the retry invitation', async () => {
  mockThread.sendResult = 'resolved'
  renderAsParty()
  await mockUpload.onUploaded?.({ url: 'https://cdn/x.jpg', type: 'image', size: 10 })

  expect(mockToasts[0].message).not.toMatch(/try again/i)
  expect(mockToasts[0].message).toMatch(/read-only/i)
})

test('a successful send still says nothing at all', async () => {
  // The toast plumbing must stay quiet on the happy path.
  mockThread.sendResult = 'sent'
  renderAsParty()
  fireEvent.press(screen.getByTestId('send'))
  await Promise.resolve()

  expect(mockToasts).toHaveLength(0)
})
