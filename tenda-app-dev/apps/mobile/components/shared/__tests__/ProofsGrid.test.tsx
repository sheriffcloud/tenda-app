/**
 * ProofsGrid — the shared proof thumbnail grid. Used by BOTH the gig detail
 * screen and the exchange/offer detail screen (payment proof), so it renders a
 * pressable tile per proof with a type label and deep-links each on press.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { MediaItem } from '@/components/shared/media/types'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { inset: '#eee' },
        border: { subtle: '#ddd' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => ({ FileText: () => null, Film: () => null, Play: () => null }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { ProofsGrid } from '@/components/shared/ProofsGrid'

const PROOFS: MediaItem[] = [
  { id: 'p1', url: 'https://cdn/x/a.jpg', type: 'image' },
  { id: 'p2', url: 'https://cdn/x/b.mp4', type: 'video' },
  { id: 'p3', url: 'https://cdn/x/c.pdf', type: 'document' },
]

test('renders one pressable tile per proof with its type label', () => {
  render(<ProofsGrid proofs={PROOFS} onProofPress={jest.fn()} />)
  expect(screen.getByLabelText('Open proof 1')).toBeTruthy()
  expect(screen.getByLabelText('Open proof 2')).toBeTruthy()
  expect(screen.getByLabelText('Open proof 3')).toBeTruthy()
  expect(screen.getByText('IMAGE')).toBeTruthy()
  expect(screen.getByText('VIDEO')).toBeTruthy()
  expect(screen.getByText('DOCUMENT')).toBeTruthy()
})

test('pressing a tile invokes onProofPress with that proof (opens the viewer)', () => {
  const onProofPress = jest.fn()
  render(<ProofsGrid proofs={PROOFS} onProofPress={onProofPress} />)
  fireEvent.press(screen.getByLabelText('Open proof 2'))
  expect(onProofPress).toHaveBeenCalledTimes(1)
  expect(onProofPress).toHaveBeenCalledWith(PROOFS[1])
})

test('renders nothing when there are no proofs (empty-state guard on the caller)', () => {
  render(<ProofsGrid proofs={[]} onProofPress={jest.fn()} />)
  expect(screen.queryByLabelText('Open proof 1')).toBeNull()
})
