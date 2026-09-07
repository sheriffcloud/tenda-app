/**
 * AddSubscriptionSheet (Stage 6) — the city chooser must report the picked key:
 * the '*' wildcard for "All cities", else the city name. Native/theme deps are
 * mocked so the test exercises the wiring over the real SearchSheet list.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff', sheet: '#fff', pressed: '#eee', inset: '#eee' },
        utility: { scrim: 'rgba(0,0,0,0.4)' },
        border: { subtle: '#ddd', strong: '#bbb' },
        control: { inputBackground: '#f0f0f0' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        brand: { primary: '#05f', primarySurface: '#e0e7ff' },
      },
    },
  }),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
jest.mock('lucide-react-native', () => ({ Search: () => null, Check: () => null, X: () => null }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { AddSubscriptionSheet } from '@/components/settings/AddSubscriptionSheet'

test('picking a searched city reports the city name', () => {
  const onPick = jest.fn()
  render(<AddSubscriptionSheet visible onClose={jest.fn()} onPick={onPick} />)
  fireEvent.changeText(screen.getByPlaceholderText('Search city…'), 'Lagos')
  fireEvent.press(screen.getByText('Lagos'))
  expect(onPick).toHaveBeenCalledWith('Lagos')
})

test('picking "All cities" reports the wildcard', () => {
  const onPick = jest.fn()
  render(<AddSubscriptionSheet visible onClose={jest.fn()} onPick={onPick} />)
  fireEvent.press(screen.getByText('All cities'))
  expect(onPick).toHaveBeenCalledWith('*')
})

test('renders nothing interactable when hidden', () => {
  render(<AddSubscriptionSheet visible={false} onClose={jest.fn()} onPick={jest.fn()} />)
  expect(screen.queryByText('All cities')).toBeNull()
})
