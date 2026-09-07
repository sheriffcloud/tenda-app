/**
 * The shared load/guard preamble for the gig detail and the applicant list.
 *
 * The cases that matter are the STALE ones. `gigs.store` holds a single
 * `selectedGig` slot for every gig, so without an id check a screen renders
 * the previous gig for a frame — which since approval mode means the previous
 * viewer's actions, e.g. "Withdraw application" on a gig this user never
 * applied to. The error slot has the same problem in reverse.
 */
/* eslint-disable @typescript-eslint/no-require-imports, react-hooks/exhaustive-deps --
 * Jest hoists these factories; requiring dependencies inside them avoids
 * pre-initialization access, and the focus-effect stub intentionally runs once. */
import { render, screen, fireEvent } from '@testing-library/react-native'
import type { GigDetail } from '@tenda/shared'
import { GigDetailGate } from '../GigDetailGate'
import type { GigLoadError } from '@/stores/gigs.store'
import { CREATOR_ID, STRANGER_ID, gigDetail } from '../__fixtures__/gig-detail'

const mockFetch = jest.fn()
// `mock`-prefixed so jest's hoisted factories may reference them.
let mockStoreState: {
  selectedGig: GigDetail | null
  error: GigLoadError | null
} = { selectedGig: null, error: null }
let mockAuthUser: { id: string } | null = { id: CREATOR_ID }

let mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: (...args: unknown[]) => mockBack(...args) }),
  // Fire the focus callback once, as focus does on mount.
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react')
    useEffect(cb, [])
  },
}))
jest.mock('@/stores', () => ({
  useGigsStore: () => ({ ...mockStoreState, fetchGigDetail: mockFetch }),
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user: mockAuthUser }),
}))
// The action callbacks are rendered as pressable text so the recovery paths
// (Retry, Go back) are exercised rather than merely declared.
jest.mock('@/components/ui', () => {
  const { Text, View } = require('react-native')
  return {
    ScreenContainer: ({
      children,
      scroll,
      padding,
    }: {
      children: React.ReactNode
      scroll?: boolean
      padding?: boolean
    }) => (
      <View accessibilityLabel={`screen-state:${String(scroll)}:${String(padding)}`}>
        {children}
      </View>
    ),
    EmptyState: ({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) => (
      <View>
        <Text>{title}</Text>
        {action !== undefined && <Text onPress={action.onPress}>{action.label}</Text>}
      </View>
    ),
  }
})
jest.mock('@/components/feedback', () => {
  const { Text, View } = require('react-native')
  return {
    LoadingScreen: () => <Text>loading</Text>,
    ErrorState: ({ title, ctaLabel, onCtaPress }: { title: string; ctaLabel: string; onCtaPress: () => void }) => (
      <View>
        <Text>{title}</Text>
        <Text onPress={onCtaPress}>{ctaLabel}</Text>
      </View>
    ),
  }
})

function renderGate(id: string | undefined, requireCreator = false) {
  const child = jest.fn((gig: GigDetail) => {
    const { Text } = require('react-native')
    return <Text>{`loaded:${gig.escrow_id}`}</Text>
  })
  render(
    <GigDetailGate id={id} requireCreator={requireCreator}>
      {child}
    </GigDetailGate>,
  )
  return child
}

beforeEach(() => {
  mockStoreState = { selectedGig: null, error: null }
  mockAuthUser = { id: CREATOR_ID }
  mockBack = jest.fn()
})

test('fetches the requested id on focus', () => {
  renderGate('gig-1')
  expect(mockFetch).toHaveBeenCalledWith('gig-1')
})

test('renders the gig once the store holds THIS id', () => {
  mockStoreState.selectedGig = gigDetail({ escrow_id: 'gig-1' })
  const child = renderGate('gig-1')

  expect(screen.getByText('loaded:gig-1')).toBeTruthy()
  expect(child).toHaveBeenCalled()
})

test('a gig from a PREVIOUS screen is never rendered — it loads instead', () => {
  // The store still holds gig-1 while gig-2 is being opened.
  mockStoreState.selectedGig = gigDetail({ escrow_id: 'gig-1' })
  const child = renderGate('gig-2')

  expect(screen.getByText('loading')).toBeTruthy()
  expect(child).not.toHaveBeenCalled()
})

test('an error from another gig does not surface on this one', () => {
  mockStoreState.error = { id: 'gig-1', message: 'Network request failed', gone: false }
  renderGate('gig-2')

  // Its own fetch is in flight; claiming failure here would be a lie.
  expect(screen.getByText('loading')).toBeTruthy()
  expect(screen.queryByText('Failed to load gig')).toBeNull()
})

test('an error for THIS gig does surface', () => {
  mockStoreState.error = { id: 'gig-1', message: 'Network request failed', gone: false }
  renderGate('gig-1')

  expect(screen.getByText('Failed to load gig')).toBeTruthy()
  expect(screen.getByLabelText('screen-state:false:false')).toBeTruthy()
})

test('no id at all shows the not-available state', () => {
  renderGate(undefined)
  expect(screen.getByText('Gig not available')).toBeTruthy()
  expect(mockFetch).not.toHaveBeenCalled()
})

// ── gone vs retryable ───────────────────────────────────────────────────────
//
// The store empties `selectedGig` on a 404, which lands the gate here. What it
// must NOT do is offer Retry: the gig was deleted or taken down, so every tap
// would fail identically and the user would be left pressing a dead button
// instead of going back.

test('a GONE gig gets the not-available state, with no Retry', () => {
  mockStoreState.error = { id: 'gig-1', message: 'Gig not found', gone: true }
  renderGate('gig-1')

  expect(screen.getByText('Gig not available')).toBeTruthy()
  expect(screen.queryByText('Failed to load gig')).toBeNull()
  expect(screen.queryByText('Retry')).toBeNull()
})

test('a gone error from ANOTHER gig still does not surface here', () => {
  // The id guard applies to both branches, not just the retryable one.
  mockStoreState.error = { id: 'gig-1', message: 'Gig not found', gone: true }
  renderGate('gig-2')

  expect(screen.getByText('loading')).toBeTruthy()
  expect(screen.queryByText('Gig not available')).toBeNull()
})

test('a gone error does not hide a gig that is still loaded', () => {
  // Belt and braces with the store: if a gig IS in the slot it renders, so a
  // stale `gone` flag can never blank a screen the store decided to keep.
  mockStoreState.selectedGig = gigDetail({ escrow_id: 'gig-1' })
  mockStoreState.error = { id: 'gig-1', message: 'Gig not found', gone: true }
  renderGate('gig-1')

  expect(screen.getByText('loaded:gig-1')).toBeTruthy()
})

test('the gone state offers a way back', () => {
  const back = jest.fn()
  mockBack = back
  mockStoreState.error = { id: 'gig-1', message: 'Gig not found', gone: true }

  renderGate('gig-1')
  fireEvent.press(screen.getByText('Go back'))
  expect(back).toHaveBeenCalled()
})

test('requireCreator renders for the poster', () => {
  mockStoreState.selectedGig = gigDetail({ escrow_id: 'gig-1' })
  renderGate('gig-1', true)
  expect(screen.getByText('loaded:gig-1')).toBeTruthy()
})

test('requireCreator blocks everyone else — the route would 403 anyway', () => {
  mockStoreState.selectedGig = gigDetail({ escrow_id: 'gig-1' })
  mockAuthUser = { id: STRANGER_ID }
  const child = renderGate('gig-1', true)

  expect(screen.getByText('Not available')).toBeTruthy()
  expect(child).not.toHaveBeenCalled()
})

test('requireCreator blocks a signed-out reader too', () => {
  mockStoreState.selectedGig = gigDetail({ escrow_id: 'gig-1' })
  mockAuthUser = null
  renderGate('gig-1', true)
  expect(screen.getByText('Not available')).toBeTruthy()
})

test('Retry re-requests the SAME id that failed', () => {
  mockStoreState.error = { id: 'gig-1', message: 'Network request failed', gone: false }
  renderGate('gig-1')
  mockFetch.mockClear()

  fireEvent.press(screen.getByText('Retry'))
  expect(mockFetch).toHaveBeenCalledWith('gig-1')
})

test('the recovery states offer a way back', () => {
  const back = jest.fn()
  mockBack = back

  renderGate(undefined)
  fireEvent.press(screen.getByText('Go back'))
  expect(back).toHaveBeenCalled()
})

test('the creator guard offers a way back too', () => {
  const back = jest.fn()
  mockBack = back
  mockStoreState.selectedGig = gigDetail({ escrow_id: 'gig-1' })
  mockAuthUser = { id: STRANGER_ID }

  renderGate('gig-1', true)
  fireEvent.press(screen.getByText('Go back'))
  expect(back).toHaveBeenCalled()
})
