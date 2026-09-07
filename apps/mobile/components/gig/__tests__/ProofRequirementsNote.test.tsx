/**
 * ProofRequirementsNote — the worker-facing side of the poster's evidence
 * gate. Two modes: pre-accept (requirement only) and in-sheet checklist
 * (`attached` supplied). Silence when nothing is required is the important
 * case — it keeps every pre-existing gig visually unchanged.
 */
import { render, screen } from '@testing-library/react-native'
import type { ProofType } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        feedback: {
          success: { base: '#0a0', surface: '#efe' },
          warning: { base: '#a60', surface: '#ffe' },
        },
      },
    },
  }),
}))

import { ProofRequirementsNote } from '../ProofRequirementsNote'

const attached = (...types: ProofType[]) => types.map((type) => ({ type }))

test('renders nothing when the gig requires no particular type', () => {
  const { toJSON } = render(<ProofRequirementsNote required={[]} />)
  expect(toJSON()).toBeNull()
})

test('renders nothing when empty even if proofs are attached', () => {
  const { toJSON } = render(<ProofRequirementsNote required={[]} attached={attached('image')} />)
  expect(toJSON()).toBeNull()
})

test('pre-accept: names the required types', () => {
  render(<ProofRequirementsNote required={['image', 'video']} />)
  expect(screen.getByText(/Required proof: photo and video/i)).toBeTruthy()
})

test('pre-accept: warns that it blocks submission', () => {
  render(<ProofRequirementsNote required={['image']} />)
  expect(screen.getByText(/before you can submit/i)).toBeTruthy()
})

test('pre-accept: a single requirement reads without a conjunction', () => {
  render(<ProofRequirementsNote required={['document']} />)
  expect(screen.getByText(/Required proof: document$/i)).toBeTruthy()
})

test('checklist: reports what is still needed', () => {
  render(<ProofRequirementsNote required={['image', 'video']} attached={attached('image')} />)
  expect(screen.getByText(/Still needed: video/i)).toBeTruthy()
})

test('checklist: confirms once every requirement is attached', () => {
  render(
    <ProofRequirementsNote required={['image', 'video']} attached={attached('image', 'video')} />,
  )
  expect(screen.getByText(/All required proof attached/i)).toBeTruthy()
  expect(screen.queryByText(/Still needed/i)).toBeNull()
})

test('checklist: a wrong-type proof leaves the requirement outstanding', () => {
  render(<ProofRequirementsNote required={['video']} attached={attached('image')} />)
  expect(screen.getByText(/Still needed: video/i)).toBeTruthy()
})

test('checklist: surplus proofs still count as satisfied', () => {
  render(
    <ProofRequirementsNote required={['image']} attached={attached('image', 'video', 'document')} />,
  )
  expect(screen.getByText(/All required proof attached/i)).toBeTruthy()
})

test('lists three requirements with commas and a final conjunction', () => {
  render(<ProofRequirementsNote required={['image', 'video', 'document']} />)
  expect(screen.getByText(/photo, video and document/i)).toBeTruthy()
})

test('regression: proofs already stored on the escrow count toward the requirement', () => {
  // The retry path — an earlier upload succeeded but the submit tx failed, so
  // the worker re-picks only the file they were missing. The note must agree
  // with the server, which counts every stored proof.
  render(
    <ProofRequirementsNote
      required={['image', 'video']}
      attached={[...attached('image'), ...attached('video')]}
    />,
  )
  expect(screen.getByText(/All required proof attached/i)).toBeTruthy()
})
