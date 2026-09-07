/**
 * The shared "★ 4.8" score.
 *
 * Worth its own tests because both of its rules are easy to get wrong from the
 * outside: `users.review_score` is numeric(3,2) and arrives as a STRING, and an
 * unrated user must read as nothing rather than as a bad rating.
 */
import { render, screen } from '@testing-library/react-native'
import { ReviewScore } from '../ReviewScore'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: { accent: { primary: '#fa0' }, content: { tertiary: '#999' } } },
  }),
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

test('renders the star and one decimal place', () => {
  render(<ReviewScore score="4.75" />)

  expect(screen.getByText('★')).toBeTruthy()
  // The wire value is a string; rendering it raw would show "4.75" here and
  // "4.8" on the next surface that remembered to coerce it.
  expect(screen.getByText('4.8')).toBeTruthy()
})

test('a whole number still shows its decimal, so scores line up', () => {
  render(<ReviewScore score="5.00" />)
  expect(screen.getByText('5.0')).toBeTruthy()
})

test('an unrated user renders NOTHING, not a zero', () => {
  // "0.0" on a new account reads as a terrible rating rather than no rating —
  // on the applicant shortlist that would quietly cost them work.
  render(<ReviewScore score={null} />)

  expect(screen.queryByText('★')).toBeNull()
  expect(screen.queryByText('0.0')).toBeNull()
})
