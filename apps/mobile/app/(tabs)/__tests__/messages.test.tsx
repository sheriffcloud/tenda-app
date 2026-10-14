/**
 * Messages tab — the glue over the chat store's inbox: it refreshes the newest
 * page on focus, asks for OLDER conversations when the list is scrolled to its
 * end, and shows a spinner only while that page is in flight. The grouping into
 * Unread / Earlier is checked here too, because paging changes what the groups
 * are computed over (whatever is loaded) and a regression there would be silent.
 */
import { ActivityIndicator, FlatList } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { END_REACHED_THRESHOLD, type Conversation } from '@tenda/shared'

const mockPush = jest.fn()
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    useRouter: () => ({ push: mockPush }),
    // Re-runs when the callback changes, as the real hook does.
    useFocusEffect: (effect: () => void) => useEffect(() => effect(), [effect]),
  }
})
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        brand: { primary: '#05f' },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => ({ MessageCircle: () => null }))
jest.mock('@/components/ui', () => {
  const { View, Text } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Header: ({ subtitle }: { subtitle?: string }) => <Text>{subtitle ?? 'no subtitle'}</Text>,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  }
})
jest.mock('@/components/ui/EmptyState', () => {
  const { Text } = require('react-native')
  return { EmptyState: ({ title }: { title: string }) => <Text>{title}</Text> }
})
jest.mock('@/components/feedback', () => {
  const { Pressable, Text } = require('react-native')
  return {
    ErrorState: ({ title, onCtaPress }: { title: string; onCtaPress: () => void }) => (
      <Pressable accessibilityLabel="retry" onPress={onCtaPress}>
        <Text>{title}</Text>
      </Pressable>
    ),
  }
})
jest.mock('@/components/chat/ConversationItem', () => {
  const { Pressable, Text } = require('react-native')
  return {
    ConversationItem: ({ conversation, onPress }: { conversation: { id: string }; onPress: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{`thread ${conversation.id}`}</Text>
      </Pressable>
    ),
  }
})

const mockFetchConversations = jest.fn(async () => {})
const mockLoadMore = jest.fn(async () => {})
const mockStore = {
  conversations: [] as Conversation[],
  loadingMoreConversations: false,
  fetchConversations: mockFetchConversations,
  loadMoreConversations: mockLoadMore,
}
// `getState` because the shared chat fixtures read the store when imported.
jest.mock('@/stores/chat.store', () => ({
  useChatStore: Object.assign(() => mockStore, { getState: () => mockStore }),
}))

import MessagesScreen from '@/app/(tabs)/messages'
import { conversation } from '@/stores/__fixtures__/chat'

beforeEach(() => {
  jest.clearAllMocks()
  mockStore.conversations = []
  mockStore.loadingMoreConversations = false
})

test('refreshes the newest page when the tab gains focus', () => {
  render(<MessagesScreen />)
  expect(mockFetchConversations).toHaveBeenCalledTimes(1)
})

test('scrolling to the end asks for older conversations, at the shared threshold', () => {
  mockStore.conversations = [conversation({ id: 'c1' })]
  render(<MessagesScreen />)
  const list = screen.UNSAFE_getByType(FlatList)

  expect(list.props.onEndReachedThreshold).toBe(END_REACHED_THRESHOLD)
  act(() => list.props.onEndReached())
  expect(mockLoadMore).toHaveBeenCalledTimes(1)
})

test('the footer spinner shows while an older page is in flight, and only then', () => {
  mockStore.conversations = [conversation({ id: 'c1' })]
  const { rerender } = render(<MessagesScreen />)
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull()

  mockStore.loadingMoreConversations = true
  rerender(<MessagesScreen />)
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).not.toBeNull()
})

test('unread threads are grouped above the earlier ones, over everything loaded', () => {
  mockStore.conversations = [
    conversation({ id: 'read-1', unread_count: 0 }),
    conversation({ id: 'unread-1', unread_count: 3 }),
    conversation({ id: 'read-2', unread_count: 0 }),
  ]
  render(<MessagesScreen />)

  expect(screen.getByText('UNREAD')).toBeTruthy()
  expect(screen.getByText('EARLIER')).toBeTruthy()
  expect(screen.getByText('1 unread thread')).toBeTruthy()
  const order = screen.UNSAFE_getByType(FlatList).props.data.map((row: { key: string }) => row.key)
  expect(order).toEqual(['h-unread', 'unread-1', 'h-earlier', 'read-1', 'read-2'])
})

test('with nothing loaded, the empty state shows and paging is not asked for by itself', () => {
  render(<MessagesScreen />)
  expect(screen.getByText('No conversations yet')).toBeTruthy()
  expect(mockLoadMore).not.toHaveBeenCalled()
})

test('a failed first load says so, and Retry asks again and clears the error', async () => {
  mockFetchConversations.mockRejectedValueOnce(new Error('offline'))
  render(<MessagesScreen />)
  expect(await screen.findByText("Couldn't load messages")).toBeTruthy()

  fireEvent.press(screen.getByLabelText('retry'))

  expect(mockFetchConversations).toHaveBeenCalledTimes(2)
  expect(await screen.findByText('No conversations yet')).toBeTruthy()
  expect(screen.queryByText("Couldn't load messages")).toBeNull()
})

test('a failed load does not blank a list that is already on screen', async () => {
  mockStore.conversations = [conversation({ id: 'c1' })]
  mockFetchConversations.mockRejectedValueOnce(new Error('offline'))
  render(<MessagesScreen />)
  await act(async () => {})
  // The error state is the EMPTY-list body; a list with rows keeps its rows.
  expect(screen.getByText('thread c1')).toBeTruthy()
})

test('tapping a thread opens the chat with the OTHER person, not the conversation id', () => {
  mockStore.conversations = [
    conversation({ id: 'c1', other_user: { id: 'u-ada', first_name: 'Ada', last_name: 'L', avatar_url: null } }),
  ]
  render(<MessagesScreen />)
  fireEvent.press(screen.getByText('thread c1'))
  expect(mockPush).toHaveBeenCalledWith('/chat/u-ada')
})
