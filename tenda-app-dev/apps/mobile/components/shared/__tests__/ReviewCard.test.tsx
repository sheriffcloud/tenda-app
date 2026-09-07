/**
 * ReviewCard — the reviewer's name, their score, and WHEN they left it.
 *
 * The card had no test at all. #38 removed two guards from it: the wire type
 * said `reviews.created_at` could be null (the column is NOT NULL, and `Review`
 * already typed it `string`), and the render then guarded the formatted label
 * for emptiness, which `formatRelativeShort` never returns. Both were dead, and
 * nothing would have noticed if removing them had dropped the stamp entirely.
 */
import { render, screen } from '@testing-library/react-native'
import type { Review } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        border: { subtle: '#eee' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        accent: { primary: '#0a0' },
      },
    },
  }),
}))
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  // Echoes its input, so an assertion proves WHICH field the card formats
  // rather than merely that some formatter ran.
  formatRelativeShort: (iso: string) => `stamp:${iso}`,
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Avatar', () => {
  const { Text } = require('react-native')
  return { Avatar: ({ name }: { name: string }) => <Text>{`avatar:${name}`}</Text> }
})

import { ReviewCard } from '@/components/shared/ReviewCard'

const CREATED_AT = '2026-08-15T10:00:00.000Z'

function review(over: Partial<Review> = {}): Review {
  return {
    id: 'rev-1',
    escrow_id: 'esc-1',
    reviewer_id: 'u1',
    reviewee_id: 'u2',
    score: 4,
    comment: 'Prompt and tidy.',
    created_at: CREATED_AT,
    ...over,
  }
}

const reviewer = { first_name: 'Ada', last_name: 'Obi', avatar_url: null }

test('shows the reviewer, their comment, and when the review was left', () => {
  render(<ReviewCard review={review()} reviewer={reviewer} label="Seeker" />)
  expect(screen.getByText('Ada Obi')).toBeTruthy()
  expect(screen.getByText('Prompt and tidy.')).toBeTruthy()
  // Unconditional since #38 — reviews.created_at is NOT NULL.
  expect(screen.getByText(`stamp:${CREATED_AT}`)).toBeTruthy()
})

test('a reviewer with no name reads as Anonymous, and is still stamped', () => {
  render(
    <ReviewCard
      review={review()}
      reviewer={{ first_name: null, last_name: null, avatar_url: null }}
      label="Seeker"
    />,
  )
  expect(screen.getByText('Anonymous')).toBeTruthy()
  expect(screen.getByText(`stamp:${CREATED_AT}`)).toBeTruthy()
})

test('a review with no comment renders the head without an empty body line', () => {
  render(<ReviewCard review={review({ comment: null })} reviewer={reviewer} label="Seeker" />)
  expect(screen.getByText('Ada Obi')).toBeTruthy()
  expect(screen.queryByText('Prompt and tidy.')).toBeNull()
})

test('the role label is shown when given and omitted when empty', () => {
  const { rerender } = render(
    <ReviewCard review={review()} reviewer={reviewer} label="Seeker" />,
  )
  expect(screen.getByText('Seeker')).toBeTruthy()

  // Callers that have no role to name pass an empty string rather than
  // branching at the call site; the card must not render a blank line for it.
  rerender(<ReviewCard review={review()} reviewer={reviewer} label="" />)
  expect(screen.queryByText('Seeker')).toBeNull()
})
