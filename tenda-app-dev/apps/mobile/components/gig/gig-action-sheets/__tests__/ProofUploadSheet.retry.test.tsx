/**
 * The sheet's submit gate, and the retry it used to block.
 *
 * A proof submit is upload-then-sign. When the SIGN half fails the files are
 * already stored — but the button was disabled on `files.length === 0`, so the
 * only way back to the signature was to pick and upload the same files again.
 * The gate now admits an empty batch whenever the escrow already holds
 * evidence covering the requirements.
 *
 * `disabled` on the button is what is asserted, not a press: `Button` renders a
 * `Pressable`, and firing a press on a disabled one is a no-op that passes
 * whether or not the gate is right.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff', backgroundAlt: '#f7f7f7', inset: '#eee' },
        border: { default: '#ddd', subtle: '#eee' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        brand: { primary: '#00f', onPrimary: '#fff' },
        feedback: {
          warning: { base: '#a60', surface: '#fe8' },
          success: { base: '#0a0', surface: '#cfc' },
          danger: { base: '#c00', surface: '#fcc' },
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
// Stands in for the real picker AND drives it: pressing "add-file" appends one
// picked image, which is the only way a test can reach the upload leg.
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

const mockUploadProofs = jest.fn()
jest.mock('../upload', () => ({ uploadProofs: (...a: unknown[]) => mockUploadProofs(...a) }))

import { ProofUploadSheet } from '../ProofUploadSheet'

const IMAGE = [{ type: 'image' as const }]

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

/**
 * Whether the submit button is disabled.
 *
 * Read off the Pressable's `accessibilityState`, which is where RN puts the
 * `disabled` prop and what a screen reader announces — found by walking up
 * from the LABEL, not by role. `Button` sets no `accessibilityRole`, so a role
 * query matches nothing and every "is it disabled" assertion would pass by
 * default; this throws rather than defaulting, for the same reason.
 */
function submitDisabled(): boolean {
  for (let node = screen.getByText('Submit').parent; node; node = node.parent) {
    const state: unknown = node.props.accessibilityState
    if (state !== null && typeof state === 'object' && 'disabled' in state) {
      return Boolean((state as { disabled?: boolean }).disabled)
    }
  }
  throw new Error('no pressable above the submit label carries a disabled state')
}

test('with nothing picked and nothing stored, submit stays disabled', () => {
  // The genuine empty case — there is no evidence anywhere, so there is
  // nothing to seal.
  setup({ requirements: ['image'] })

  expect(submitDisabled()).toBe(true)
})

test('with nothing picked but the escrow already holding proof, submit is LIVE', () => {
  // The retry. Before this the worker was locked out of their own signature.
  setup({ requirements: ['image'], alreadyAttached: IMAGE })

  expect(submitDisabled()).toBe(false)
})

test('the retry signs without uploading anything', async () => {
  const { onSubmit } = setup({ requirements: ['image'], alreadyAttached: IMAGE })

  fireEvent.press(screen.getByText('Submit'))
  await screen.findByText('add-file')

  expect(mockUploadProofs).not.toHaveBeenCalled()
  // An empty batch, which `submit` reads as "seal what is already stored".
  expect(onSubmit).toHaveBeenCalledWith([])
})

test('stored proof that does NOT cover the requirements still blocks', () => {
  // The gate loosened for the retry, not for the checklist: a gig needing a
  // document is not satisfied by a photo, whoever uploaded it.
  setup({ requirements: ['document'], alreadyAttached: IMAGE })

  expect(submitDisabled()).toBe(true)
})

test('the add-more-proof path is unaffected — no stored proof, no free submit', () => {
  // It is handed no `alreadyAttached` AND no `requirements` at all, and
  // uploading nothing there would mean nothing at all. (Its real label is
  // "Upload"; kept as "Submit" so the shared helper can find the button.)
  setup()

  expect(submitDisabled()).toBe(true)
})

test('the sheet says what is already stored, deduplicated and counted', () => {
  // Three photos is an ordinary batch; listing per row read "Photo, Photo,
  // Photo". And without the line at all, the retry is an empty form with a
  // live button and no explanation.
  setup({
    requirements: ['image'],
    alreadyAttached: [{ type: 'image' }, { type: 'image' }, { type: 'document' }],
  })

  expect(screen.getByText(/3 proofs/)).toBeTruthy()
  expect(screen.queryByText(/Photo, Photo/i)).toBeNull()
})

test('a failed upload leaves the sheet open and never hands anything on', async () => {
  // `uploadProofs` toasts its own failure and answers null. Closing here would
  // throw away the worker's picked files on the one path where they still need
  // them, and calling onSubmit would sign over evidence that is not stored.
  mockUploadProofs.mockResolvedValue(null)
  const onClose = jest.fn()
  const { onSubmit } = setup({ requirements: ['image'], onClose })

  fireEvent.press(screen.getByText('add-file'))
  fireEvent.press(screen.getByText('Submit'))
  await screen.findByText('add-file')

  expect(mockUploadProofs).toHaveBeenCalled()
  expect(onSubmit).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})

test('a picked file IS uploaded — the retry path must not swallow real batches', async () => {
  // The other side of `reusesAttached`: skipping the upload whenever the sheet
  // has stored proof would silently drop whatever the worker just added.
  mockUploadProofs.mockResolvedValue([{ url: 'u9', type: 'image' }])
  const { onSubmit } = setup({ requirements: ['image'], alreadyAttached: IMAGE })

  fireEvent.press(screen.getByText('add-file'))
  fireEvent.press(screen.getByText('Submit'))
  await screen.findByText('add-file')

  expect(mockUploadProofs).toHaveBeenCalled()
  expect(onSubmit).toHaveBeenCalledWith([{ url: 'u9', type: 'image' }])
})

test("closeMode 'on-success' keeps the sheet open when the hand-off is refused", async () => {
  // The add-more-proof timing: the sheet owns the outcome, so a false answer
  // has to leave the worker where they were rather than dismissing them.
  const onClose = jest.fn()
  const onSubmit = jest.fn().mockResolvedValue(false)
  render(
    <ProofUploadSheet
      visible
      onClose={onClose}
      title="Submit proof"
      submitLabel="Submit"
      closeMode="on-success"
      requirements={['image']}
      alreadyAttached={IMAGE}
      onSubmit={onSubmit}
    />,
  )

  fireEvent.press(screen.getByText('Submit'))
  await screen.findByText('add-file')

  expect(onSubmit).toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})

test("closeMode 'on-success' closes and clears once the hand-off is accepted", async () => {
  // The other arm of the on-success timing. Its refusal twin is covered above;
  // without this, a sheet that never closed on success would look identical to
  // the tests and be unusable in the app.
  const onClose = jest.fn()
  const onSubmit = jest.fn().mockResolvedValue(true)
  render(
    <ProofUploadSheet
      visible
      onClose={onClose}
      title="Submit proof"
      submitLabel="Submit"
      closeMode="on-success"
      requirements={['image']}
      alreadyAttached={IMAGE}
      onSubmit={onSubmit}
    />,
  )

  fireEvent.press(screen.getByText('Submit'))

  // `waitFor`, not a bare microtask hop: the close runs after an awaited
  // onSubmit, and the state updates that follow it have to settle inside act
  // or the assertion races the render and the suite logs an act() warning.
  await waitFor(() => expect(onClose).toHaveBeenCalled())
  expect(onSubmit).toHaveBeenCalled()
})

test('the wallet hint is shown when the caller supplies one', () => {
  // Submitting proof opens the wallet; the sheet is where that is promised, and
  // "no funds leave your wallet" is the reassurance that stops a worker
  // abandoning the step.
  setup({ requirements: ['image'], alreadyAttached: IMAGE, hint: 'Opens your wallet' })

  expect(screen.getByText('Opens your wallet')).toBeTruthy()
})

// ── the injected signer preview ────────────────────────────────────────────

test('the sheet renders the signer preview it is handed', () => {
  // Submit opens a wallet and the escrow has already bound WHICH one, so the
  // worker has to be told before they pick files rather than after the chain
  // refuses. The row is injected — the sheet has no business knowing about
  // wallets — but it has to actually mount it.
  //
  // There is deliberately no negative twin HERE: omitting the prop renders
  // `{undefined}`, which is indistinguishable from rendering it, so such a
  // test could not fail for its stated reason. The contract that matters —
  // that the OFF-CHAIN add-more sheet is handed no row at all — is asserted
  // where the decision is made, in GigActionSheets.test.
  const { Text } = require('react-native')
  setup({ signerRow: <Text>signer-preview</Text> })

  expect(screen.getByText('signer-preview')).toBeTruthy()
})
