/**
 * AppVersion — the build-identity footer on Settings and Profile.
 *
 * Both screens previously carried their own `<Text>Tenda v1.0.0</Text>`, which
 * is how they came to advertise a version the binary had never been. The single
 * assertion that matters here is that the component RENDERS what the helper
 * returns rather than any string of its own.
 */
import { render, screen } from '@testing-library/react-native'
import { AppVersion } from '@/components/ui/AppVersion'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: { content: { tertiary: '#666' } } } }),
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return {
    Text: ({ children, style }: { children: React.ReactNode; style?: unknown }) => (
      <Text style={style}>{children}</Text>
    ),
  }
})

const mockGetAppVersion = jest.fn()
jest.mock('@/lib/app-version', () => ({
  getAppVersion: () => mockGetAppVersion(),
}))

beforeEach(() => {
  mockGetAppVersion.mockReturnValue({ version: '0.4.1', build: '3', label: 'Tenda v0.4.1 (3)' })
})

it('renders the label the helper produced', () => {
  render(<AppVersion />)
  expect(screen.getByText('Tenda v0.4.1 (3)')).toBeTruthy()
})

it('follows the helper rather than holding a version of its own', () => {
  // If the component ever hardcodes a string again, this is what fails.
  mockGetAppVersion.mockReturnValue({ version: '2.0.0', build: '77', label: 'Tenda v2.0.0 (77)' })
  render(<AppVersion />)
  expect(screen.getByText('Tenda v2.0.0 (77)')).toBeTruthy()
  expect(screen.queryByText('Tenda v0.4.1 (3)')).toBeNull()
})

it('renders the degraded label without inventing a version', () => {
  mockGetAppVersion.mockReturnValue({ version: null, build: null, label: 'Tenda' })
  render(<AppVersion />)
  expect(screen.getByText('Tenda')).toBeTruthy()
})

it('applies the caller-supplied marginTop, defaulting to 34', () => {
  // Settings sits at 34 and Profile at 18; collapsing the two copies into one
  // component is only safe if that difference survives.
  const { unmount } = render(<AppVersion />)
  expect(screen.getByText('Tenda v0.4.1 (3)').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ marginTop: 34 })]),
  )
  unmount()

  render(<AppVersion marginTop={18} />)
  expect(screen.getByText('Tenda v0.4.1 (3)').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ marginTop: 18 })]),
  )
})
