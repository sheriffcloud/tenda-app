/**
 * DrawerHeader badge (Stage 5/7). The bell's unread bubble is conditional
 * logic: hidden at zero, shown for a positive count, capped at "99+". Native
 * chrome (unistyles, safe-area, icons) is mocked.
 */
import { render, screen } from '@testing-library/react-native'
// Resolves to the stub below at runtime, but keeps the real LucideIcon type, so
// the rightIcon prop is exercised against the type the app actually passes.
import { Bell } from 'lucide-react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { background: '#fff' },
        border: { subtle: '#ddd' },
        content: { primary: '#000', secondary: '#333' },
        brand: { primary: '#05f', onPrimary: '#fff' },
      },
    },
  }),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('lucide-react-native', () => ({ Menu: () => null, Bell: () => null }))
jest.mock('@/components/ui', () => {
  const { Text } = require('react-native')
  return {
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Avatar: () => null,
  }
})

import { DrawerHeader } from '@/components/navigation/DrawerHeader'

test('no badge when the count is zero', () => {
  render(<DrawerHeader onMenuPress={jest.fn()} rightIcon={Bell} badgeCount={0} showAvatar={false} />)
  expect(screen.queryByText('0')).toBeNull()
})

test('shows the exact count when positive', () => {
  render(<DrawerHeader onMenuPress={jest.fn()} rightIcon={Bell} badgeCount={5} showAvatar={false} />)
  expect(screen.getByText('5')).toBeTruthy()
})

test('caps the badge at 99+', () => {
  render(<DrawerHeader onMenuPress={jest.fn()} rightIcon={Bell} badgeCount={150} showAvatar={false} />)
  expect(screen.getByText('99+')).toBeTruthy()
})
