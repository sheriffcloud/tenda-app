/**
 * Post-a-Gig must hand back a BLANK form after a gig is committed.
 *
 * The screen is a tab screen, so it never unmounts, and GigForm seeds its
 * fields from `initialValues` exactly once — meaning nothing about posting a
 * gig blanks the composer on its own. Users saw the gig they had just posted
 * still sitting in the form on their next visit.
 *
 * useGigFunding decides WHEN (its own suite covers that); this pins the other
 * half — that the screen's reset actually rebuilds the form rather than just
 * dropping a draft prefill that a fresh create never had.
 */
import { render, screen, fireEvent, act } from '@testing-library/react-native'

let mockCapturedReset: (() => void) | null = null
let mockDraftIdArg: string | undefined
let mockParams: { draftId?: string } = {}

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
}))
jest.mock('@/hooks/useGigFunding', () => ({
  useGigFunding: (args: { draftId?: string; resetForm: () => void }) => {
    mockCapturedReset = args.resetForm
    mockDraftIdArg = args.draftId
    return {
      pendingValues: null,
      setPendingValues: jest.fn(),
      phase: 'idle',
      monitor: null,
      blockedMessage: null,
      dismissBlocked: jest.fn(),
      runFunding: jest.fn(),
      handleFunded: jest.fn(),
      handleFundTimeout: jest.fn(),
    }
  },
}))

// The stub mirrors the one property of the real GigForm that matters here:
// fields are seeded from `initialValues` once, then owned locally — so the
// only way the title can go back to empty is a genuine remount.
jest.mock('@/components/gig/GigForm', () => {
  const { useState } = require('react')
  const { TextInput } = require('react-native')
  return {
    GigForm: ({ initialValues }: { initialValues?: { title?: string } }) => {
      const [title, setTitle] = useState(initialValues?.title ?? '')
      return <TextInput testID="title" value={title} onChangeText={setTitle} />
    },
  }
})

jest.mock('@/components/ui/ScreenContainer', () => {
  const { View } = require('react-native')
  return { ScreenContainer: ({ children }: { children: React.ReactNode }) => <View>{children}</View> }
})
jest.mock('@/components/ui', () => ({ Header: () => null }))
jest.mock('@/components/ui/Toast', () => ({ showToast: jest.fn() }))
jest.mock('@/components/reputation', () => ({ RestrictionBanner: () => null }))
jest.mock('@/components/onboarding/NudgeSheet', () => ({ NudgeSheet: () => null }))
jest.mock('@/components/feedback/LoadingScreen', () => ({ LoadingScreen: () => null }))
jest.mock('@/components/feedback', () => ({ TransactionMonitor: () => null }))
jest.mock('@/components/escrow', () => ({ TxConfirmDialog: () => null }))
jest.mock('@/components/moderation/ModerationBlockedDialog', () => ({ ModerationBlockedDialog: () => null }))
jest.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: () => ({ dismissedNudges: { post: true } }),
}))
// Partial: the screen reads TX_PROGRESS_LABEL from shared since the copy
// moved there (2026-08-15) — keep the real module underneath the two stubs.
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  coerceCityForCountry: (_c: string | null, city: string | null) => city,
  formatAssetAmount: () => '',
}))
jest.mock('@/api/client', () => ({ api: { gigs: { get: jest.fn() } } }))

import PostGigScreen from '../create-gig'

beforeEach(() => {
  mockCapturedReset = null
  mockDraftIdArg = undefined
  mockParams = {}
})

function typedTitle(): string {
  return screen.getByTestId('title').props.value as string
}

test('a committed gig hands back a blank form on the next visit', () => {
  render(<PostGigScreen />)
  fireEvent.changeText(screen.getByTestId('title'), 'Fix my sink')
  expect(typedTitle()).toBe('Fix my sink')

  // What useGigFunding calls once the gig is funded, or saved as a draft.
  act(() => { mockCapturedReset?.() })

  expect(typedTitle()).toBe('')
})

test('an uncommitted gig survives re-renders — the reset is the ONLY thing that clears it', () => {
  // Without this the first test would pass just as well against a form that
  // blanked itself on every render, which would eat gigs mid-composition.
  const { rerender } = render(<PostGigScreen />)
  fireEvent.changeText(screen.getByTestId('title'), 'Half-written gig')

  rerender(<PostGigScreen />)

  expect(typedTitle()).toBe('Half-written gig')
})

test('resetting twice keeps working — the generation is not a one-shot flag', () => {
  render(<PostGigScreen />)

  fireEvent.changeText(screen.getByTestId('title'), 'First gig')
  act(() => { mockCapturedReset?.() })
  expect(typedTitle()).toBe('')

  fireEvent.changeText(screen.getByTestId('title'), 'Second gig')
  act(() => { mockCapturedReset?.() })
  expect(typedTitle()).toBe('')
})

test("a cleared draftId param reads as absent, so the reposted draft's id is not resent", () => {
  // useGigFunding clears the param with '' (tab screens retain params); if the
  // screen read that as a real id it would try to delete the same draft again.
  mockParams = { draftId: '' }
  render(<PostGigScreen />)

  expect(mockDraftIdArg).toBeUndefined()
})
