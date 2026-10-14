/**
 * The sheet's DATA-proof path: captured entries count toward the checklist
 * exactly like picked files, and the batch handed to onSubmit carries both
 * classes. The capture UI itself is tested in DataProofInputs.test — here it
 * is a stub that emits one entry, so what is under test is the SHEET's
 * gating and merging.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff', inset: '#eee' },
        border: { default: '#ddd', subtle: '#eee' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        brand: { primary: '#00f', onPrimary: '#fff' },
        feedback: {
          warning: { base: '#a60', surface: '#fe8' },
          success: { base: '#0a0', surface: '#cfc' },
        },
      },
    },
  }),
}))
jest.mock('@/components/ui/BottomSheet', () => {
  const { View } = require('react-native')
  return {
    BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View>{children}</View> : null,
  }
})
jest.mock('@/components/form/FilePicker', () => {
  const { Text, Pressable } = require('react-native')
  return {
    FilePicker: ({
      files,
      onChange,
    }: {
      files: { type: string }[]
      onChange: (next: { name: string; type: string; uri: string }[]) => void
    }) => (
      <Pressable
        onPress={() => onChange([...files, { name: 'p.jpg', type: 'image', uri: 'file://p.jpg' }] as never)}
      >
        <Text>add-file</Text>
      </Pressable>
    ),
  }
})
// A stub capture UI: one press reports one text entry, mirroring the real
// component's contract (entries only when complete).
const TEXT_ENTRY = { type: 'text', payload: { text: 'done' } }
jest.mock('../data-proofs/DataProofInputs', () => {
  const { Text, Pressable } = require('react-native')
  return {
    DataProofInputs: ({ onChange }: { onChange: (entries: unknown[]) => void }) => (
      <Pressable onPress={() => onChange([TEXT_ENTRY])}>
        <Text>capture-data</Text>
      </Pressable>
    ),
  }
})

const mockUploadProofs = jest.fn()
jest.mock('../upload', () => ({ uploadProofs: (...a: unknown[]) => mockUploadProofs(...a) }))

import { ProofUploadSheet } from '../ProofUploadSheet'

function setup(props: Partial<React.ComponentProps<typeof ProofUploadSheet>> = {}) {
  const onSubmit = jest.fn().mockResolvedValue(true)
  render(
    <ProofUploadSheet
      visible
      onClose={jest.fn()}
      title="Submit proof"
      submitLabel="Submit"
      closeMode="before-submit"
      onSubmit={onSubmit}
      {...props}
    />,
  )
  return { onSubmit }
}

function submitDisabled(): boolean {
  for (let node = screen.getByText('Submit').parent; node; node = node.parent) {
    const state: unknown = node.props.accessibilityState
    if (state !== null && typeof state === 'object' && 'disabled' in state) {
      return Boolean((state as { disabled?: boolean }).disabled)
    }
  }
  throw new Error('no pressable above the submit label carries a disabled state')
}

beforeEach(() => jest.clearAllMocks())

test('the capture UI appears only when a DATA type is required', () => {
  setup({ requirements: ['image'] })
  expect(screen.queryByText('capture-data')).toBeNull()
})

test('a required data type blocks submit until its entry is captured', () => {
  setup({ requirements: ['text'] })
  expect(submitDisabled()).toBe(true)

  fireEvent.press(screen.getByText('capture-data'))
  expect(submitDisabled()).toBe(false)
})

test('a data-only batch skips the upload leg and hands the entries on', async () => {
  const { onSubmit } = setup({ requirements: ['text'] })
  fireEvent.press(screen.getByText('capture-data'))
  fireEvent.press(screen.getByText('Submit'))
  await screen.findByText('capture-data')

  expect(mockUploadProofs).not.toHaveBeenCalled()
  expect(onSubmit).toHaveBeenCalledWith([TEXT_ENTRY])
})

test('a mixed batch merges uploaded files with captured entries', async () => {
  mockUploadProofs.mockResolvedValue([{ url: 'u1', type: 'image' }])
  const { onSubmit } = setup({ requirements: ['image', 'text'] })

  fireEvent.press(screen.getByText('add-file'))
  fireEvent.press(screen.getByText('capture-data'))
  fireEvent.press(screen.getByText('Submit'))
  await screen.findByText('capture-data')

  expect(onSubmit).toHaveBeenCalledWith([{ url: 'u1', type: 'image' }, TEXT_ENTRY])
})

test('a captured entry ends the reuse path — this is a NEW batch, not a retry', () => {
  // With stored proof AND a fresh capture, submit must go through the normal
  // leg (persist the new entry), not the empty-batch reuse.
  const { onSubmit } = setup({ requirements: ['text'], alreadyAttached: [{ type: 'text' }] })
  fireEvent.press(screen.getByText('capture-data'))
  fireEvent.press(screen.getByText('Submit'))
  expect(onSubmit).toHaveBeenCalledWith([TEXT_ENTRY])
})
