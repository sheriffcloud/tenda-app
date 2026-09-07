/**
 * The detail screen's input sheets.
 *
 * What this file really guards is which sheets promise a WALLET. Submit and
 * dispute both sign, and the escrow has already bound which wallet may — so
 * both name it. Adding evidence is off-chain, and naming a signing wallet
 * there would promise a step that never comes.
 */
import type { ComponentProps } from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockDelete = jest.fn()
const mockSubmitResult = jest.fn()
const mockToast = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }))
jest.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }))
jest.mock('@/api/client', () => ({
  api: { escrows: { delete: (...a: unknown[]) => mockDelete(...a) } },
}))
jest.mock('@/components/wallet/SigningWalletRow', () => {
  const { Text } = require('react-native')
  return {
    SigningWalletRow: ({ chainId, bound }: { chainId: string; bound?: string | null }) => (
      <Text>{`signer:${chainId}:${String(bound)}`}</Text>
    ),
  }
})
// Each sheet has its own suite; here they are labelled slots, so what is
// asserted is which of them is HANDED a signer row.
jest.mock('../gig-action-sheets/ProofUploadSheet', () => {
  const { Text, View } = require('react-native')
  return {
    ProofUploadSheet: ({
      visible,
      title,
      signerRow,
      requirements,
      alreadyAttached,
      onSubmit,
    }: {
      visible: boolean
      title: string
      signerRow?: React.ReactNode
      requirements?: readonly string[]
      alreadyAttached?: readonly unknown[]
      onSubmit: (p: unknown[]) => Promise<boolean>
    }) =>
      visible ? (
        <View>
          <Text>{`proof-sheet:${title}`}</Text>
          <Text>{`reqs:${String(requirements?.length)}:attached:${String(alreadyAttached?.length)}`}</Text>
          {signerRow ?? <Text>no-signer-row</Text>}
          <Text onPress={() => void onSubmit([{ url: 'u', type: 'image' }]).then((r) => mockSubmitResult(r))}>
            fire-submit
          </Text>
        </View>
      ) : null,
  }
})
jest.mock('../gig-action-sheets/DisputeSheet', () => {
  const { Text, View } = require('react-native')
  return {
    DisputeSheet: ({
      visible,
      bondLabel,
      signerRow,
    }: {
      visible: boolean
      bondLabel: string | null
      signerRow?: React.ReactNode
    }) =>
      visible ? (
        <View>
          <Text>{`dispute-sheet:${String(bondLabel)}`}</Text>
          {signerRow ?? <Text>no-signer-row</Text>}
        </View>
      ) : null,
  }
})
jest.mock('../gig-action-sheets/ReviewSheet', () => {
  const { Text } = require('react-native')
  return {
    ReviewSheet: ({ visible, escrowId }: { visible: boolean; escrowId: string }) =>
      visible ? <Text>{`review-sheet:${escrowId}`}</Text> : null,
  }
})
jest.mock('../gig-action-sheets/DeleteDraftDialog', () => {
  const { Text } = require('react-native')
  return {
    DeleteDraftDialog: ({ visible, onConfirm }: { visible: boolean; onConfirm: () => void }) =>
      visible ? <Text onPress={onConfirm}>confirm-delete</Text> : null,
  }
})

// eslint-disable-next-line import/first
import { GigActionSheets } from '../GigActionSheets'

const GIG = {
  escrow_id: 'e1',
  chain_id: 'eip155:84532',
  my_signer_address: '0xBound111',
  dispute_bond_raw: '5000000',
  asset: 'USDC_BASE',
  proof_requirements: ['image'] as const,
  proofs: [] as const,
}

/** The escrow shape the sheets take — typed, so a mistyped override in a test
 *  is a compile error rather than a silent pass against the default. */
type SheetGig = ComponentProps<typeof GigActionSheets>['gig']

function setup(
  activeSheet: 'proof' | 'addProof' | 'dispute' | 'review' | 'delete' | null,
  gigOver: Partial<SheetGig> = {},
) {
  const onClose = jest.fn()
  const onAddProofsReady = jest.fn().mockResolvedValue(undefined)
  render(
    <GigActionSheets
      gig={{ ...GIG, ...gigOver }}
      activeSheet={activeSheet}
      onClose={onClose}
      onReviewSubmitted={jest.fn()}
      onProofsReady={jest.fn()}
      onAddProofsReady={onAddProofsReady}
      onDisputeReady={jest.fn()}
    />,
  )
  return { onClose, onAddProofsReady }
}

beforeEach(() => {
  mockDelete.mockReset().mockResolvedValue(undefined)
  mockToast.mockReset()
  mockBack.mockReset()
  mockSubmitResult.mockReset()
})

test('the submit sheet names the wallet the on-chain commit will open', () => {
  setup('proof')
  expect(screen.getByText('signer:eip155:84532:0xBound111')).toBeTruthy()
})

test('the dispute sheet names it too — the bond leaves a specific wallet', () => {
  setup('dispute')
  expect(screen.getByText('signer:eip155:84532:0xBound111')).toBeTruthy()
})

test('adding evidence is OFF-CHAIN, so it names no wallet at all', () => {
  setup('addProof')
  expect(screen.getByText('no-signer-row')).toBeTruthy()
  expect(screen.queryByText(/^signer:/)).toBeNull()
})

test('a zero bond is stated as no bond, not as "0 USDC"', () => {
  setup('dispute', { dispute_bond_raw: '0' })
  expect(screen.getByText('dispute-sheet:null')).toBeTruthy()
})

test('a non-zero bond is formatted in the escrow’s own asset', () => {
  setup('dispute')
  expect(screen.getByText('dispute-sheet:5 USDC')).toBeTruthy()
})

test('nothing is open when no sheet is active', () => {
  setup(null)
  expect(screen.queryByText(/-sheet/)).toBeNull()
})

test('deleting a draft discards it off-chain and leaves the screen', async () => {
  const { onClose } = setup('delete')

  fireEvent.press(screen.getByText('confirm-delete'))
  await Promise.resolve()

  expect(onClose).toHaveBeenCalled()
  expect(mockDelete).toHaveBeenCalledWith({ id: 'e1' })
  expect(mockBack).toHaveBeenCalled()
})

test('a failed delete says so and does NOT pretend the draft is gone', async () => {
  mockDelete.mockRejectedValue(new Error('server said no'))
  setup('delete')

  fireEvent.press(screen.getByText('confirm-delete'))
  await Promise.resolve()
  await Promise.resolve()

  expect(mockToast).toHaveBeenCalledWith('error', 'server said no')
  expect(mockBack).not.toHaveBeenCalled()
})

test('a delete failure with a BLANK message still explains itself', async () => {
  // A transport can reject with an empty message; passing it straight through
  // leaves the user with a toast that says nothing at all.
  mockDelete.mockRejectedValue(new Error(''))
  setup('delete')

  fireEvent.press(screen.getByText('confirm-delete'))
  await Promise.resolve()
  await Promise.resolve()

  expect(mockToast).toHaveBeenCalledWith('error', 'Failed to delete draft')
})

test('the add-more submit always resolves true — nothing on chain can refuse it', async () => {
  // The sheet closes on a true result. Off-chain uploads have no second leg
  // to fail, so echoing the upload's own outcome would leave it open forever.
  const { onAddProofsReady } = setup('addProof')

  fireEvent.press(screen.getByText('fire-submit'))
  await Promise.resolve()
  await Promise.resolve()

  expect(onAddProofsReady).toHaveBeenCalledWith([{ url: 'u', type: 'image' }])
  expect(mockSubmitResult).toHaveBeenCalledWith(true)
})

test('an exchange offer declares no proof requirements, and is handed empties', () => {
  // ExchangeDetail satisfies the same shape without the gig-only fields; a
  // missing list must read as "none", never as undefined reaching the sheet.
  setup('proof', { proof_requirements: undefined, proofs: undefined })
  expect(screen.getByText('reqs:0:attached:0')).toBeTruthy()
})

test('a gig hands its own requirements and stored proofs through', () => {
  setup('proof', { proof_requirements: ['image', 'document'], proofs: [{ type: 'image' }] })
  expect(screen.getByText('reqs:2:attached:1')).toBeTruthy()
})

test('the review sheet is opened against this escrow', () => {
  setup('review')
  expect(screen.getByText('review-sheet:e1')).toBeTruthy()
})
