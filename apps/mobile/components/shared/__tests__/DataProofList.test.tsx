/**
 * DataProofList — data proofs rendered as their payload. The partition rule
 * is what matters: file proofs are the grid's business, so this renders
 * ONLY rows with a payload, and nothing at all for the file-only escrows
 * every pre-#14 escrow is.
 */
import { render, screen } from '@testing-library/react-native'
import type { EscrowProof } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#111', secondary: '#666', tertiary: '#999' },
        border: { subtle: '#eee' },
        surface: { card: '#fff' },
      },
    },
  }),
}))

import { DataProofList } from '../DataProofList'

const base = {
  escrow_id: 'e1',
  uploaded_by: 'u1',
  uploaded_at: new Date('2026-08-27T00:00:00Z'),
}
const fileProof = { ...base, id: 'p1', type: 'image', url: 'https://media/1', payload: null }
const proofs = [
  fileProof,
  { ...base, id: 'p2', type: 'text', url: null, payload: { text: 'Left at the gate' } },
  {
    ...base,
    id: 'p3',
    type: 'structured',
    url: null,
    payload: { values: { count: 3, sealed: true } },
  },
  {
    ...base,
    id: 'p4',
    type: 'geotag',
    url: null,
    payload: { latitude: 6.52443891, longitude: 3.37921234 },
  },
] as unknown as EscrowProof[]

test('renders every data proof as label + payload lines, through the shared formatter', () => {
  render(<DataProofList proofs={proofs} />)
  expect(screen.getByText('Written answer')).toBeTruthy()
  expect(screen.getByText('Left at the gate')).toBeTruthy()
  expect(screen.getByText('Structured data')).toBeTruthy()
  expect(screen.getByText('count')).toBeTruthy()
  expect(screen.getByText('3')).toBeTruthy()
  expect(screen.getByText('sealed')).toBeTruthy()
  expect(screen.getByText('Yes')).toBeTruthy()
  expect(screen.getByText('Location check-in')).toBeTruthy()
  expect(screen.getByText('6.52444, 3.37921')).toBeTruthy()
})

test('file proofs are NOT rendered here — they belong to the media grid', () => {
  render(<DataProofList proofs={proofs} />)
  expect(screen.queryByText('Photo')).toBeNull()
})

test('renders nothing at all for a file-only escrow', () => {
  const { toJSON } = render(<DataProofList proofs={[fileProof] as unknown as EscrowProof[]} />)
  expect(toJSON()).toBeNull()
})
