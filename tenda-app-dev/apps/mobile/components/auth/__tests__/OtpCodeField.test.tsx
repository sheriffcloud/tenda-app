/**
 * OtpCodeField, the shared segmented one-time-code input. A hidden numeric
 * TextInput drives N visual cells. Asserts digit-only sanitisation, length cap,
 * and that the entered digits surface in the cells.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff' },
        brand: { primary: '#0a0' },
        border: { default: '#ccc' },
        content: { primary: '#000' },
      },
    },
  }),
}))
jest.mock('@/components/ui', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/theme/tokens', () => ({ typography: { fonts: { body: { semibold: 'semibold' } } } }))

import { OtpCodeField } from '@/components/auth/OtpCodeField'

test('strips non-digits and caps at the configured length', () => {
  const onChange = jest.fn()
  render(<OtpCodeField value="" onChange={onChange} length={6} />)
  fireEvent.changeText(screen.getByLabelText('One-time code'), '12ab34567')
  expect(onChange).toHaveBeenCalledWith('123456') // letters dropped, capped to 6
})

test('renders the entered digits across the cells', () => {
  render(<OtpCodeField value="42" onChange={jest.fn()} length={6} />)
  // The two entered digits appear; remaining cells are blank.
  expect(screen.getByText('4')).toBeTruthy()
  expect(screen.getByText('2')).toBeTruthy()
})

test('honours a custom accessibility label', () => {
  render(<OtpCodeField value="" onChange={jest.fn()} accessibilityLabel="Verification code" />)
  expect(screen.getByLabelText('Verification code')).toBeTruthy()
})
