/**
 * The review row's "About the poster / worker" caption is the EYEBROW style.
 *
 * It sat at a near copy (mono 10/13/600/+0.6) beside the eyebrow's
 * 9.5/12/600/+0.95 while web drew the same caption through its Eyebrow (#59c).
 * Its sibling suite mocks `Text` down to bare children, which is right for
 * what it asserts and useless here, so this one keeps the real Text and reads
 * the flattened style.
 */
import { render, screen } from '@testing-library/react-native'
import { StyleSheet, type TextStyle } from 'react-native'
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
jest.mock('@/components/ui/Avatar', () => {
  const { Text } = require('react-native')
  return { Avatar: ({ name }: { name: string }) => <Text>{`avatar:${name}`}</Text> }
})

import { ReviewCard } from '@/components/shared/ReviewCard'
import { typography } from '@/theme/tokens'

const REVIEW: Review = {
  id: 'rev-1',
  escrow_id: 'esc-1',
  reviewer_id: 'u1',
  reviewee_id: 'u2',
  score: 4,
  comment: 'Prompt and tidy.',
  created_at: '2026-08-15T10:00:00.000Z',
}

test('the role caption draws the eyebrow token style, uppercased', () => {
  render(
    <ReviewCard review={REVIEW} reviewer={{ first_name: 'Ada', last_name: 'Obi', avatar_url: null }} label="About the poster" />,
  )
  const style = StyleSheet.flatten(screen.getByText('About the poster').props.style as TextStyle)
  const token = typography.styles.eyebrow
  expect(style.fontFamily).toBe(token.fontFamily)
  expect(style.fontSize).toBe(token.fontSize)
  expect(style.lineHeight).toBe(token.lineHeight)
  expect(style.letterSpacing).toBe(token.letterSpacing)
  expect(style.textTransform).toBe('uppercase')
})
