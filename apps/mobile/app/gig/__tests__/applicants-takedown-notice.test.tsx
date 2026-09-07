/**
 * The applicants screen must SAY when the gig has been taken down.
 *
 * Without it a takedown reads as a bug on this screen specifically: `assignable`
 * flips false, every Assign button disappears, and the poster is left staring
 * at a shortlist of people they cannot act on with nothing explaining why. The
 * gig detail grew a banner for exactly this; the shortlist is the other screen
 * the same poster reaches, and it was left silent.
 *
 * Structural, in the manner of chain-filter-placement: the screen is mocked
 * down to its shell, because what is under test is whether the notice is
 * MOUNTED HERE — something no unit test of TakedownNotice can answer.
 *
 * The second test is the one that pays for this file twice over: the notice
 * must occupy no space at all on a visible gig. The first version of this
 * change wrapped it in a padded View unconditionally, which reserved a band of
 * blank space above the list on every gig that was perfectly fine — a
 * regression paid by the common case to serve the rare one.
 */
/* eslint-disable @typescript-eslint/no-require-imports, import/first -- Jest factories load dependencies after hoisting. */
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { GigDetail } from '@tenda/shared'
import { gigDetail, CREATOR_ID } from '@/components/gig/__fixtures__/gig-detail'

jest.mock('react-native-unistyles', () => ({
  // `StyleSheet` too, not just the hook: components/ui/Header imports BOTH from
  // unistyles, and a partial mock makes `StyleSheet.create` an undefined call
  // at module load — a failure that points at Header rather than at the mock.
  StyleSheet: { create: (s: unknown) => s },
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#000', secondary: '#666', tertiary: '#999' },
        surface: { background: '#fff', backgroundAlt: '#eee', inset: '#eee', sheet: '#fff' },
        utility: { scrim: 'rgba(0,0,0,0.4)' },
        border: { subtle: '#ddd', default: '#ccc', strong: '#bbb' },
        brand: { primary: '#50f' },
        feedback: {
          success: { base: '#1F9D6B', surface: '#E6F4ED' },
          warning: { base: '#C9780C', surface: '#FBEFD9' },
          danger: { base: '#CB3A3A', surface: '#F9E4E4' },
          info: { base: '#2F6CC9', surface: '#E6EEFB' },
        },
      },
    },
  }),
}))

// The gig under test, swapped per case. `mock`-prefixed so the hoisted factory
// below may close over it.
let mockGig: GigDetail = gigDetail()
/** `mock`-prefixed so the hoisted gate factory may reference it (jest rule). */
const mockViewerId = CREATOR_ID
const mockFetchGigDetail = jest.fn()
const mockLoadApplicants = jest.fn()
const mockUseEscrowLiveRefresh = jest.fn()

// The ui BARREL only. Safe for what is under test: ExpandableNotice and
// TakedownNotice use direct imports rather than this barrel, so the compact
// notice and its sheet still render for real — only the screen chrome
// (ScreenContainer's SafeAreaView, Header's insets) is stubbed away.
jest.mock('@/components/ui', () => {
  const { View } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Header: () => null,
    showToast: jest.fn(),
  }
})
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'gig-1' }),
  useFocusEffect: () => {},
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

// The gate is what supplies (gig, userId); bypassing it keeps this test about
// the screen body rather than about loading.
jest.mock('@/components/gig', () => ({
  GigDetailGate: ({ children }: { children: (g: GigDetail, u: string) => React.ReactNode }) =>
    children(mockGig, mockViewerId),
}))
jest.mock('@/components/gig/gig-applications', () => {
  const { View } = require('react-native')
  return {
    ApplicantList: () => <View testID="applicant-list" />,
    useApplicantList: () => ({ applicants: [], error: null, load: mockLoadApplicants }),
  }
})
jest.mock('@/components/feedback', () => ({ TransactionMonitor: () => null }))
jest.mock('@/hooks/useEscrowActions', () => ({
  useEscrowActions: () => ({
    busyAction: null,
    pendingTxRef: null,
    pendingAction: null,
    activeAction: null,
    phase: 'idle',
    assign: jest.fn(),
    clearPending: jest.fn(),
  }),
}))
jest.mock('@/hooks/useEscrowLiveRefresh', () => ({
  useEscrowLiveRefresh: (
    escrowId: string | undefined,
    refresh: () => void | Promise<void>,
    status: GigDetail['status'],
  ) => mockUseEscrowLiveRefresh(escrowId, refresh, status),
}))
jest.mock('@/stores', () => ({
  useGigsStore: () => ({ fetchGigDetail: mockFetchGigDetail }),
}))

import ApplicantsScreen from '../[id]/applicants'

test('a taken-down gig explains itself to the poster', () => {
  mockGig = gigDetail({ hidden: true, requires_approval: true })
  render(<ApplicantsScreen />)

  // The OWNER wording — this screen only ever has the poster on it.
  const notice = screen.getByRole('button', { name: /removed by moderation/i })
  expect(screen.queryByText(/funds in escrow are unaffected/i)).toBeNull()
  fireEvent.press(notice)
  expect(screen.getByText(/funds in escrow are unaffected/i)).toBeTruthy()
  // And the shortlist is still there: a takedown hides the listing, it does not
  // take the poster's screen away.
  expect(screen.getByTestId('applicant-list')).toBeTruthy()
})

test('a visible gig renders NO banner and no space where one would go', () => {
  mockGig = gigDetail({ requires_approval: true })
  const { toJSON } = render(<ApplicantsScreen />)

  expect(screen.queryByText('Removed by moderation')).toBeNull()
  expect(screen.queryByRole('button', { name: /removed by moderation/i })).toBeNull()
  // The stronger half: no empty padded wrapper left behind either. Serialised
  // once and searched, because a View reserving 12px of nothing is invisible to
  // every assertion that only asks about text.
  const tree = JSON.stringify(toJSON())
  expect(tree).not.toContain('paddingTop')
})

test('live convergence refreshes both gig permissions and applicant rows', async () => {
  mockGig = gigDetail({ requires_approval: true, status: 'open' })
  render(<ApplicantsScreen />)

  expect(mockUseEscrowLiveRefresh).toHaveBeenCalledWith(
    mockGig.escrow_id,
    expect.any(Function),
    'open',
  )
  const refresh = mockUseEscrowLiveRefresh.mock.calls.at(-1)?.[1] as (() => Promise<void>) | undefined
  expect(refresh).toBeDefined()
  await refresh?.()

  expect(mockFetchGigDetail).toHaveBeenCalledWith(mockGig.escrow_id)
  expect(mockLoadApplicants).toHaveBeenCalledTimes(1)
})
