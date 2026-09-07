/**
 * Header — regression coverage for the right-slot action. Both the standard
 * and the `large` variant must render a passed `rightIcon` and fire
 * `onRightPress`; the large variant previously dropped it on the floor, which
 * hid the Trade tab's "post a sell offer" + button entirely.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { background: '#fff', inset: '#eee' },
        border: { subtle: '#ddd' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        brand: { primary: '#5b21b6' },
      },
    },
  }),
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { Plus } from 'lucide-react-native'
import { Header } from '../Header'

test('large variant renders the right action and fires onRightPress', () => {
  const onRightPress = jest.fn()
  render(
    <Header variant="large" title="Trade" subtitle="Swap crypto" rightIcon={Plus} onRightPress={onRightPress} />,
  )
  const btn = screen.getByRole('button')
  expect(btn).toBeTruthy()
  fireEvent.press(btn)
  expect(onRightPress).toHaveBeenCalledTimes(1)
})

test('large variant still renders title + subtitle alongside the action', () => {
  render(<Header variant="large" title="Trade" subtitle="Swap crypto" rightIcon={Plus} onRightPress={jest.fn()} />)
  expect(screen.getByText('Trade')).toBeTruthy()
  expect(screen.getByText('Swap crypto')).toBeTruthy()
})

test('large variant without a rightIcon renders no button', () => {
  render(<Header variant="large" title="Wallet" />)
  expect(screen.queryByRole('button')).toBeNull()
})

test('standard variant renders the right action and fires onRightPress', () => {
  const onRightPress = jest.fn()
  render(<Header title="Detail" rightIcon={Plus} onRightPress={onRightPress} />)
  fireEvent.press(screen.getByRole('button'))
  expect(onRightPress).toHaveBeenCalledTimes(1)
})
