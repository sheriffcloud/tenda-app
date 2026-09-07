/**
 * Settings and Profile must each show the running build's version.
 *
 * That line used to be a hardcoded `<Text>Tenda v1.0.0</Text>` copied into both
 * screens, which is how both came to advertise a version the binary had never
 * been. Collapsing them onto one component fixed the lie but created a new way
 * to fail silently: with no test naming the screens, deleting `<AppVersion />`
 * from either one removes the version from the UI and breaks nothing.
 *
 * So this pins the PLACEMENT, the way chain-filter-placement.test.tsx does for
 * the chain chips. The component itself is REAL (only the manifest read is
 * stubbed), so the whole screen → component → helper chain is exercised: a
 * screen that re-hardcodes a string fails here even though the string looks
 * perfectly plausible.
 *
 * Both screens are mocked down to their shells; the mocks are shared rather
 * than per-describe because every describe body evaluates before the first test
 * runs, so two factories for one module would just overwrite each other.
 */
import { render } from '@testing-library/react-native'

/** The only stub inside the chain under test — stands in for the manifest. */
const LABEL = 'Tenda v9.9.9 (42)'
jest.mock('@/lib/app-version', () => ({
  getAppVersion: () => ({ version: '9.9.9', build: '42', label: 'Tenda v9.9.9 (42)' }),
}))

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#000', secondary: '#666', tertiary: '#999' },
        surface: { background: '#fff', inset: '#eee' },
        border: { subtle: '#ddd' },
        brand: { primary: '#50f' },
        feedback: { danger: { base: '#f00', surface: '#fee' } },
      },
    },
  }),
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => undefined,
}))
jest.mock('@/components/ui', () => {
  const { View } = require('react-native')
  const { Text } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Header: () => null,
    Spacer: () => null,
    showToast: jest.fn(),
    Text: ({ children, style }: { children: React.ReactNode; style?: unknown }) => (
      <Text style={style}>{children}</Text>
    ),
    // Real, for the same reason the chain-filter test keeps PaginatedList real:
    // a stubbed AppVersion would make this test pass while the screens rendered
    // nothing at all.
    AppVersion: jest.requireActual('@/components/ui/AppVersion').AppVersion,
  }
})
jest.mock('@/components/ui/SectionLabel', () => ({ SectionLabel: () => null }))
jest.mock('@/components/ui/Header', () => ({ Header: () => null }))
jest.mock('@/components/settings/SettingsRow', () => ({
  SettingsGroup: () => null,
  SettingsRow: () => null,
}))
jest.mock('@/components/settings/AppearanceSegment', () => ({ AppearanceSegment: () => null }))
jest.mock('@/components/settings/SubscriptionsSection', () => ({ SubscriptionsSection: () => null }))
jest.mock('@/components/settings/CurrencySheet', () => ({ CurrencySheet: () => null }))
jest.mock('@/components/reputation', () => ({ RestrictionBanner: () => null }))
jest.mock('@/components/seeker/SeekerWelcomeSheet', () => ({ SeekerWelcomeSheet: () => null }))
jest.mock('@/components/profile', () => ({
  ProfileHero: () => null,
  ProfileStats: () => null,
  ProfileMenu: () => null,
}))

const mockAuthState = {
  user: { id: 'u1', first_name: 'A', last_name: 'B', is_seeker: false, review_score: null },
  wallets: [],
  walletAddress: null,
  logout: jest.fn(),
  refreshUser: jest.fn(),
  updateUser: jest.fn(),
}
// Both call styles are in use: `useAuthStore()` destructured, and
// `useAuthStore(selector)`.
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel?: (s: typeof mockAuthState) => unknown) => (sel ? sel(mockAuthState) : mockAuthState),
}))
jest.mock('@/stores/settings.store', () => ({
  useSettingsStore: () => ({
    theme: 'system',
    setTheme: jest.fn(),
    currency: 'NGN',
    setCurrency: jest.fn(),
  }),
}))
jest.mock('@/hooks/useProfileStats', () => ({
  useProfileStats: () => ({ active: 0, completed: 0, posted: 0 }),
}))
jest.mock('@/api/client', () => ({ api: { users: { updateMe: jest.fn() } } }))
// Spread the real module, then override only what this test wants stubbed.
// It used to be an allowlist of two exports, which meant any screen under test
// importing a THIRD thing from @tenda/shared died with "x is not a function" —
// a failure about this mock, reported as a bug in the screen. Profile adding
// `formatFullName` is exactly that, and the next one would be too.
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual<typeof import('@tenda/shared')>('@tenda/shared'),
  CURRENCY_META: { NGN: { flag: '🇳🇬', symbol: '₦' } },
  truncateWallet: (a: string) => a,
}))

import SettingsScreen from '@/app/(tabs)/settings'
import ProfileScreen from '@/app/(tabs)/profile'

test.each([
  ['Settings', SettingsScreen],
  ['Profile', ProfileScreen],
])('%s renders exactly one version line, read from the manifest', (_name, Screen) => {
  const { getAllByText, queryByText } = render(<Screen />)

  // Exactly one: the screens each had their own copy, and two would mean the
  // duplication came back.
  expect(getAllByText(LABEL)).toHaveLength(1)

  // The regression itself. Any literal here — however plausible — is a lie the
  // moment the version moves.
  expect(queryByText('Tenda v1.0.0')).toBeNull()
})

test('a screen that stops rendering the component fails this suite', () => {
  // Guard the guard: the assertions above are only meaningful because the label
  // is absent from a screen that does not render AppVersion. Without this, a
  // mocked-away component would let both cases pass vacuously.
  const Bare = () => null
  const { queryByText } = render(<Bare />)
  expect(queryByText(LABEL)).toBeNull()
})
