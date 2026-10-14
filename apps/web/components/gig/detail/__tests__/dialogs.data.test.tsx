/**
 * ProofUploadDialog's DATA-proof path: captured entries count toward the
 * checklist exactly like picked files, and the batch handed to onSubmit
 * carries both classes. The capture UI is tested in data-proof-inputs.test;
 * here it is a stub emitting one entry, so the DIALOG's gating and merging
 * is what is under test.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

const { uploadProofsMock, TEXT_ENTRY } = vi.hoisted(() => ({
  uploadProofsMock: vi.fn(),
  TEXT_ENTRY: { type: 'text', payload: { text: 'done' } },
}))
vi.mock('@/lib/uploads/escrow-proofs', () => ({
  uploadProofs: (...a: unknown[]) => uploadProofsMock(...a),
}))
vi.mock('@/components/form/FilePicker', () => ({
  FilePicker: ({
    files,
    onChange,
  }: {
    files: { file: File; type: string }[]
    onChange: (next: { file: File; type: string }[]) => void
  }) => (
    <button type="button" onClick={() => onChange([...files, { file: new File(['x'], 'p.jpg'), type: 'image' }])}>
      add-file
    </button>
  ),
}))
vi.mock('@/components/gig/detail/data-proofs/DataProofInputs', () => ({
  DataProofInputs: ({ onChange }: { onChange: (entries: unknown[]) => void }) => (
    <button type="button" onClick={() => onChange([TEXT_ENTRY])}>
      capture-data
    </button>
  ),
}))
vi.mock('@/components/wallet/SigningWalletRow', () => ({ SigningWalletRow: () => null }))

import { ProofUploadDialog } from '@/components/gig/detail/ProofUploadDialog'

function setup(props: Partial<React.ComponentProps<typeof ProofUploadDialog>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(true)
  render(
    <ProofUploadDialog
      open
      onClose={vi.fn()}
      title="Submit proof"
      submitLabel="Submit"
      closeMode="before-submit"
      onSubmit={onSubmit}
      {...props}
    />,
  )
  return { onSubmit, submit: () => screen.getByRole('button', { name: 'Submit' }) }
}

beforeEach(() => vi.clearAllMocks())

test('the capture UI appears only when a DATA type is required', () => {
  setup({ requirements: ['image'] })
  expect(screen.queryByText('capture-data')).not.toBeInTheDocument()
})

test('a required data type blocks submit until its entry is captured', () => {
  const { submit } = setup({ requirements: ['text'] })
  expect(submit()).toBeDisabled()
  fireEvent.click(screen.getByText('capture-data'))
  expect(submit()).toBeEnabled()
})

test('a data-only batch skips the upload leg and hands the entries on', async () => {
  const { onSubmit, submit } = setup({ requirements: ['text'] })
  fireEvent.click(screen.getByText('capture-data'))
  fireEvent.click(submit())
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([TEXT_ENTRY]))
  expect(uploadProofsMock).not.toHaveBeenCalled()
})

test('a mixed batch merges uploaded files with captured entries', async () => {
  uploadProofsMock.mockResolvedValue([{ url: 'u1', type: 'image' }])
  const { onSubmit, submit } = setup({ requirements: ['image', 'text'] })
  fireEvent.click(screen.getByText('add-file'))
  fireEvent.click(screen.getByText('capture-data'))
  fireEvent.click(submit())
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([{ url: 'u1', type: 'image' }, TEXT_ENTRY]))
})

test('a captured entry ends the reuse path — this is a NEW batch, not a retry', async () => {
  const { onSubmit, submit } = setup({ requirements: ['text'], alreadyAttached: [{ type: 'text' }] })
  fireEvent.click(screen.getByText('capture-data'))
  fireEvent.click(submit())
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([TEXT_ENTRY]))
})
