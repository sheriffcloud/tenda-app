/**
 * What a sign-out must EMPTY (#65).
 *
 * Signing out on RN is a navigation, not a process restart: every module in the
 * JS context — and every zustand store, which is a module singleton by
 * construction — outlives it. So the next account signing in on the same device
 * session inherits whatever the last one left behind.
 *
 * For chat that is private message content and an unread badge. The inbox reads
 * `conversations` straight from the store with no loading gate and derives its
 * Unread section from `unread_count`, so the previous account's threads are on
 * screen from the first frame until the new fetch lands — and if that fetch
 * fails the screen keeps them and shows a retry.
 *
 * THE OTHER HALF — that nothing writes back AFTER the clear — is per store, in
 * `account-switch-<store>.test.ts`. Clearing on logout only holds if a request
 * that left before it cannot land after it.
 */
import { useChatStore } from '@/stores/chat.store'
import { useGigsStore } from '@/stores/gigs.store'
import { useEscrowStore } from '@/stores/escrow.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useAuthStore } from '@/stores/auth.store'
import { gigDetail } from '@/components/gig/__fixtures__/gig-detail'
import { conversation as conv, message as msg, resetChatStore } from '../__fixtures__/chat'
import { notif } from '../__fixtures__/notifications'

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: { conversations: { list: jest.fn() } },
}))
jest.mock('@/lib/secure-store', () => ({
  clearAuthStorage: jest.fn(async () => {}),
  getJwtToken:      jest.fn(async () => null),
  getWalletAddress: jest.fn(async () => null),
  setJwtToken:      jest.fn(async () => {}),
  setWalletAddress: jest.fn(async () => {}),
}))

beforeEach(() => {
  resetChatStore()
  useNotificationsStore.getState().reset()
  useGigsStore.setState({ selectedGig: null, isLoading: false, error: null })
  useEscrowStore.setState({ isBusy: false, error: null })
})

test('signing out empties the chat store — the next account inherits nothing', async () => {
  useChatStore.setState({
    conversations: [conv({ id: 'c1', last_message: 'private to account A' })],
    messages:      { c1: [msg({ id: 'm1', content: 'private to account A' })] },
    unread:        3,
  })

  await useAuthStore.getState().logout()

  const chat = useChatStore.getState()
  expect(chat.conversations).toEqual([])
  expect(chat.messages).toEqual({})
  expect(chat.unread).toBe(0)
})

test('signing out empties the selected gig, which carries the previous viewer', async () => {
  // `selectedGig` holds the viewer block — another user's Apply/Withdraw state
  // — which is why a leftover offers a wrong ACTION, not merely stale text.
  useGigsStore.setState({ selectedGig: gigDetail() })

  await useAuthStore.getState().logout()

  expect(useGigsStore.getState().selectedGig).toBeNull()
})

test('signing out empties the notification feed and its badge', async () => {
  useNotificationsStore.setState({ notifications: [notif('n1')], unread: 4, feedStatus: 'ready' })

  await useAuthStore.getState().logout()

  const bell = useNotificationsStore.getState()
  expect(bell.notifications).toEqual([])
  expect(bell.unread).toBe(0)
})

test('signing out clears the escrow action flags, so the next account is not locked out', async () => {
  // No escrow CONTENT lives there — only the transient action state — but a
  // leftover `isBusy` greys out the next account's first Accept or Submit until
  // something else happens to reset it, and a leftover error banner reports a
  // failure that was not theirs.
  useEscrowStore.setState({ isBusy: true, error: 'Transaction rejected' })

  await useAuthStore.getState().logout()

  const escrow = useEscrowStore.getState()
  expect(escrow.isBusy).toBe(false)
  expect(escrow.error).toBeNull()
})
