/**
 * The gig detail screen's own wiring (#152).
 *
 * Everything this screen draws has a suite already — the CTA branches, the
 * sheets, the confirm dialog, the body. What had none is the file that JOINS
 * them: which handler each child is handed, and what that handler does. tsc
 * checks the shapes and nothing checked the behaviour, so a Share that named
 * the wrong host, a refresh that never cleared its spinner, or a confirmed
 * cancel that stayed on a dead screen would all have compiled.
 *
 * Structural, like the applicants suite beside it: the children are stubs that
 * RECORD the props they were given, because what is under test is this file.
 * Two are kept real on purpose — DetailChrome, because the Share button's
 * accessibility label is how a user finds it, and GigCTABar, because "which
 * press reaches which handler" is the wiring itself and a stubbed bar would
 * only prove the test presses its own button.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { RefreshControl, Share } from 'react-native'
import { formatAssetAmount, txSuccessCopy, type ActiveSheet, type EscrowTxType, type GigDetail } from '@tenda/shared'
import { gigDetail, CREATOR_ID, STRANGER_ID, WORKER_ID, userRef } from '@/components/gig/__fixtures__/gig-detail'
import type { EscrowProofInput } from '@/hooks/useEscrowActions'
import type { MediaItem } from '@/components/shared/media/types'
/** Tied to the real signature, so a renamed variant breaks this stub too. */
type ToastVariant = Parameters<typeof import('@/components/ui/Toast').showToast>[0]

/** The gig and viewer under test, swapped per case (`mock`-prefixed for the hoisted factories). */
let mockGig: GigDetail = gigDetail()
let mockViewerId = STRANGER_ID
const mockFetchGigDetail = jest.fn()
const mockRecordCommitment = jest.fn()
const mockBack = jest.fn()
const mockPush = jest.fn()
const mockToast = jest.fn()
const mockLiveRefresh = jest.fn()
const mockDismissedNudges: Record<string, boolean> = {}

/** Props the stubbed children were last rendered with — the wiring, recorded. */
interface SheetsCapture {
  activeSheet: ActiveSheet | null
  onClose: () => void
  onProofsReady: (proofs: EscrowProofInput[]) => Promise<boolean>
  onAddProofsReady: (proofs: EscrowProofInput[]) => Promise<void>
  onDisputeReady: (reason: string) => Promise<boolean>
  onReviewSubmitted: () => void
}
interface ConfirmCapture {
  action: EscrowTxType | null
  chainId: string
  boundSigner: string | null
  ctx: { amount: string; netAmount: string | null; feePct: string | null; deliverWithin: string | null }
  onConfirm: () => void
  onCancel: () => void
}
interface BodyCapture {
  onProofPress: (item: MediaItem) => void
  onReport: () => void
  onOpenDisputeThread: () => void
}
interface BarCapture {
  onTxAction: (action: EscrowTxType) => void
  onRetryDraft: () => void
}
interface ActionOptionsCapture {
  escrowId: string
  chainId: string
  asset: string
  amountRaw: string
  onStale: () => void
}
interface ApprovalOptionsCapture {
  escrowId: string
  onChanged: () => void
  onRequestUnassign: () => void
}
interface MonitorCapture {
  readDetail: () => Promise<GigDetail>
  refresh: () => void
  onConfirmed: () => void
}
const mockCapture: {
  sheets: SheetsCapture | null
  confirm: ConfirmCapture | null
  body: BodyCapture | null
  bar: BarCapture | null
  monitor: MonitorCapture | null
  actionOptions: ActionOptionsCapture | null
  approvalOptions: ApprovalOptionsCapture | null
  media: MediaItem | null
  reportOpen: boolean
  closeMedia: () => void
  closeReport: () => void
  closeNudge: () => void
} = {
  sheets: null,
  confirm: null,
  body: null,
  bar: null,
  monitor: null,
  actionOptions: null,
  approvalOptions: null,
  media: null,
  reportOpen: false,
  closeMedia: () => {},
  closeReport: () => {},
  closeNudge: () => {},
}

/** The action hook, mutable per case. Its methods are what each press must reach. */
const mockActions = {
  busyAction: null as EscrowTxType | null,
  pendingTxRef: null as string | null,
  pendingAction: null as EscrowTxType | null,
  accept: jest.fn(),
  approve: jest.fn(),
  claim: jest.fn(),
  cancel: jest.fn(),
  refund: jest.fn(),
  unassign: jest.fn(),
  decline: jest.fn(),
  submit: jest.fn(),
  addProofs: jest.fn(),
  dispute: jest.fn(),
  clearPending: jest.fn(),
}
/** The fee projection the confirm dialog quotes — a NET below the principal.
 *  Mutable, because "config has not landed yet" is a real render: both halves
 *  are null until the platform config arrives. */
const MOCK_NET_RAW = 990_000n
const MOCK_FEE_PCT = '1.00'
const mockFee: { feeBps: number | null; feePct: string | null; feeRaw: bigint | null; netRaw: bigint | null } = {
  feeBps: 100,
  feePct: MOCK_FEE_PCT,
  feeRaw: 10_000n,
  netRaw: MOCK_NET_RAW,
}
/** Distinct per environment, so the shared URL proves WHICH config was read. */
const MOCK_STAGING_HOST = 'https://staging.api.test'

jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  // Three DISTINCT hosts, so the share URL says which entry was read. The
  // staging one is a getter: ES imports are hoisted above the consts below, so
  // a factory that took the value would take `undefined`.
  apiConfig: {
    development: { baseUrl: 'https://dev.api.test', timeout: 5000, retries: 0 },
    staging: { get baseUrl() { return MOCK_STAGING_HOST }, timeout: 10000, retries: 2 },
    production: { baseUrl: 'https://prod.api.test', timeout: 15000, retries: 3 },
  },
}))
jest.mock('@/lib/env', () => ({ getEnv: () => 'staging' }))

jest.mock('react-native-unistyles', () => ({
  StyleSheet: { create: <T,>(styles: T): T => styles },
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#000', secondary: '#666', tertiary: '#999' },
        surface: { background: '#fff', card: '#fff', inset: '#eee' },
        border: { subtle: '#ddd', default: '#ccc' },
        brand: { primary: '#50f', solid: '#50f', onPrimary: '#fff' },
        feedback: {
          success: { base: '#1F9D6B', surface: '#E6F4ED', solid: '#1F9D6B' },
          warning: { base: '#C9780C', surface: '#FBEFD9' },
          danger: { base: '#CB3A3A', surface: '#F9E4E4', solid: '#CB3A3A' },
        },
      },
    },
  }),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    useRouter: () => ({ push: mockPush, back: mockBack }),
    useLocalSearchParams: () => ({ id: 'escrow-1' }),
    // The nudge rides useFocusEffect; a no-op mock would leave that branch
    // unreachable, so this runs the callback the way arriving on the screen does.
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
  }
})

jest.mock('@/components/ui', () => {
  const { View } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    ConfirmDialog: () => null,
    // Wrapped, not passed: ES imports are hoisted above these consts, so a
    // factory that captured the value would capture `undefined`.
    showToast: (variant: ToastVariant, message: string) => mockToast(variant, message),
    // Real: DetailChrome draws its buttons with this, and the Share button's
    // label is the affordance under test.
    FloatingChromeButton: jest.requireActual('@/components/ui/FloatingChromeButton').FloatingChromeButton,
  }
})
jest.mock('@/components/gig', () => {
  const { View } = require('react-native')
  return {
    // The gate supplies (gig, userId); bypassing it keeps this about the body.
    GigDetailGate: ({ children }: { children: (g: GigDetail, u: string) => React.ReactNode }) =>
      children(mockGig, mockViewerId),
    GigDetailBody: (props: BodyCapture) => {
      mockCapture.body = props
      return <View testID="gig-body" />
    },
    // The REAL bar, wrapped only to record what it was handed: the presses
    // below go through it for real, and the exotic transitions no fixture puts
    // on screen are driven through the recorded prop.
    GigCTABar: (props: BarCapture) => {
      mockCapture.bar = props
      const { GigCTABar } = jest.requireActual('@/components/gig/GigCTABar')
      return <GigCTABar {...props} />
    },
    GigActionSheets: (props: SheetsCapture) => {
      mockCapture.sheets = props
      return <View testID={`sheets:${props.activeSheet ?? 'none'}`} />
    },
  }
})
jest.mock('@/components/gig/gig-applications', () => ({
  ApplySheet: () => null,
  useGigApprovalFlow: (options: ApprovalOptionsCapture) => {
    mockCapture.approvalOptions = options
    return {
      busy: false,
      applyOpen: false,
      closeApply: jest.fn(),
      apply: jest.fn(),
      handleAction: jest.fn(),
      confirmDialog: { visible: false },
    }
  },
}))
jest.mock('@/components/escrow', () => {
  const { View } = require('react-native')
  return {
    DetailChrome: jest.requireActual('@/components/escrow/DetailChrome').DetailChrome,
    TxConfirmDialog: (props: ConfirmCapture) => {
      mockCapture.confirm = props
      return <View testID={`confirm:${props.action ?? 'none'}`} />
    },
    EscrowTransactionMonitor: (props: MonitorCapture) => {
      mockCapture.monitor = props
      return null
    },
  }
})
jest.mock('@/components/onboarding/NudgeSheet', () => {
  const { View } = require('react-native')
  return {
    NudgeSheet: ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
      mockCapture.closeNudge = onClose
      return visible ? <View testID="accept-nudge" /> : null
    },
  }
})
jest.mock('@/components/moderation/ReportSheet', () => {
  const { View } = require('react-native')
  return {
    ReportSheet: ({ visible, onClose, contentType, contentId }: {
      visible: boolean
      onClose: () => void
      contentType: string
      contentId: string
    }) => {
      mockCapture.reportOpen = visible
      mockCapture.closeReport = onClose
      return visible ? <View testID={`report:${contentType}:${contentId}`} /> : null
    },
  }
})
jest.mock('@/components/shared/media/MediaViewerModal', () => {
  const { View } = require('react-native')
  return {
    MediaViewerModal: ({ item, onClose }: { item: MediaItem | null; onClose: () => void }) => {
      mockCapture.media = item
      mockCapture.closeMedia = onClose
      return item === null ? null : <View testID="media-viewer" />
    },
  }
})
jest.mock('@/api/client', () => ({ api: { gigs: { get: jest.fn() } } }))
jest.mock('@/hooks/useEscrowActions', () => ({
  useEscrowActions: (options: ActionOptionsCapture) => {
    mockCapture.actionOptions = options
    return mockActions
  },
}))
jest.mock('@/hooks/useEscrowLiveRefresh', () => ({
  useEscrowLiveRefresh: (escrowId: string, refresh: () => void, status: GigDetail['status']) =>
    mockLiveRefresh(escrowId, refresh, status),
}))
jest.mock('@/hooks/useEscrowFee', () => ({ useEscrowFee: () => mockFee }))
/**
 * Every store this screen reads, mocked at the BARREL rather than at three
 * internal paths. `@/stores` is the surface — mocking the files behind it ties
 * the suite to which path the screen happens to import from, and the screen
 * switching between the two forms (both legal, both used here before) made all
 * 29 cases fail with `useOnboardingStore is not a function`. A store the
 * screen starts reading and this map omits fails the same way, loudly, which
 * is the right failure.
 */
jest.mock('@/stores', () => ({
  useGigsStore: () => ({ fetchGigDetail: mockFetchGigDetail }),
  useOnboardingStore: () => ({ dismissedNudges: mockDismissedNudges }),
  useNotificationPromptStore: { getState: () => ({ recordCommitment: mockRecordCommitment }) },
}))
jest.mock('@/stores/platform-config.store', () => ({
  // No config yet, which is a real first render: the bar falls back to the
  // shared default rather than reading a grace period off null.
  usePlatformConfigStore: (select: (s: { config: null }) => number | undefined) => select({ config: null }),
}))

import GigDetailScreen from '../[id]/index'

beforeEach(() => {
  mockGig = gigDetail()
  mockViewerId = STRANGER_ID
  mockActions.pendingAction = null
  mockCapture.sheets = null
  mockCapture.confirm = null
  mockCapture.body = null
  mockCapture.bar = null
  mockCapture.monitor = null
  mockCapture.actionOptions = null
  mockCapture.approvalOptions = null
  mockCapture.media = null
  mockCapture.reportOpen = false
  mockFee.feePct = MOCK_FEE_PCT
  mockFee.netRaw = MOCK_NET_RAW
  delete mockDismissedNudges.accept
})

test('Share sends the shared sentence and the API host this build talks to', () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' })
  render(<GigDetailScreen />)

  fireEvent.press(screen.getByLabelText('Share'))

  // The sentence is the shared helper's (web posts the same one); the URL is
  // the API host's page, and the host is the one getEnv() selected.
  expect(share).toHaveBeenCalledWith({
    message: `Paint the fence on Tenda\n${MOCK_STAGING_HOST}/gig/escrow-1`,
  })
})

test('pull-to-refresh re-reads the gig and clears its own spinner', async () => {
  let settle = (): void => {}
  mockFetchGigDetail.mockReturnValueOnce(new Promise<void>((resolve) => { settle = () => resolve() }))
  const view = render(<GigDetailScreen />)
  const control = view.UNSAFE_getByType(RefreshControl)
  expect(control.props.refreshing).toBe(false)

  let pull: Promise<void> = Promise.resolve()
  act(() => { pull = control.props.onRefresh() })
  expect(view.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true)

  await act(async () => { settle(); await pull })
  expect(mockFetchGigDetail).toHaveBeenCalledWith('escrow-1')
  expect(view.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false)
})

test('a sheet CTA opens that sheet, and closing it puts the screen back', () => {
  mockGig = gigDetail({ status: 'accepted', counterparty: userRef(WORKER_ID) })
  mockViewerId = WORKER_ID
  render(<GigDetailScreen />)

  fireEvent.press(screen.getByText('Submit Proof'))
  expect(screen.getByTestId('sheets:proof')).toBeTruthy()

  act(() => mockCapture.sheets?.onClose())
  expect(screen.getByTestId('sheets:none')).toBeTruthy()
})

test('a wallet CTA asks first, quotes the NET, and only then signs', () => {
  render(<GigDetailScreen />)
  expect(mockCapture.confirm?.action).toBeNull()

  fireEvent.press(screen.getByText('Accept Gig'))
  expect(screen.getByTestId('confirm:accept')).toBeTruthy()
  // The wallet the dialog promises to open: this gig's chain, and the signer
  // the escrow is bound to (null here — nothing is bound before accepting).
  expect(mockCapture.confirm?.chainId).toBe('solana:devnet')
  expect(mockCapture.confirm?.boundSigner).toBeNull()
  expect(mockCapture.confirm?.ctx).toMatchObject({
    amount: formatAssetAmount('1000000', 'USDC_SOL'),
    netAmount: formatAssetAmount(MOCK_NET_RAW.toString(), 'USDC_SOL'),
    feePct: MOCK_FEE_PCT,
  })
  expect(mockActions.accept).not.toHaveBeenCalled()

  act(() => mockCapture.confirm?.onConfirm())
  expect(mockActions.accept).toHaveBeenCalledTimes(1)
  // And the dialog closes on the way — a second confirm would sign twice.
  expect(screen.getByTestId('confirm:none')).toBeTruthy()
})

test('declining the confirm signs nothing', () => {
  render(<GigDetailScreen />)
  fireEvent.press(screen.getByText('Accept Gig'))

  act(() => mockCapture.confirm?.onCancel())

  expect(screen.getByTestId('confirm:none')).toBeTruthy()
  expect(mockActions.accept).not.toHaveBeenCalled()
})

test('a confirmed accept toasts, records the commitment and re-reads', () => {
  mockActions.pendingAction = 'accept'
  render(<GigDetailScreen />)

  act(() => mockCapture.monitor?.onConfirmed())

  expect(mockActions.clearPending).toHaveBeenCalledTimes(1)
  // The shared copy, not a regex over it: the toast a user reads is that
  // sentence, and a helper renamed under it would still match /accepted/i.
  expect(mockToast).toHaveBeenCalledWith('success', txSuccessCopy('accept', 'gig'))
  expect(mockRecordCommitment).toHaveBeenCalledTimes(1)
  expect(mockFetchGigDetail).toHaveBeenCalledWith('escrow-1')
  expect(mockBack).not.toHaveBeenCalled()
})

test('a confirmed cancel leaves the screen instead of re-reading a dead gig', () => {
  mockViewerId = CREATOR_ID
  mockActions.pendingAction = 'cancel'
  render(<GigDetailScreen />)
  mockFetchGigDetail.mockClear()

  act(() => mockCapture.monitor?.onConfirmed())

  expect(mockBack).toHaveBeenCalledTimes(1)
  expect(mockFetchGigDetail).not.toHaveBeenCalled()
  // No commitment: only accepting is one.
  expect(mockRecordCommitment).not.toHaveBeenCalled()
})

test('a transaction confirmed with nothing pending stays silent', () => {
  render(<GigDetailScreen />)

  act(() => mockCapture.monitor?.onConfirmed())

  expect(mockToast).not.toHaveBeenCalled()
})

test('a FAILED submit re-reads, so the sheet reopens knowing what already uploaded', async () => {
  mockGig = gigDetail({ status: 'accepted', counterparty: userRef(WORKER_ID) })
  mockViewerId = WORKER_ID
  render(<GigDetailScreen />)
  fireEvent.press(screen.getByText('Submit Proof'))
  mockFetchGigDetail.mockClear()
  mockActions.submit.mockResolvedValueOnce(false)

  const proofs: EscrowProofInput[] = []
  await act(async () => {
    expect(await mockCapture.sheets?.onProofsReady(proofs)).toBe(false)
  })

  expect(mockActions.submit).toHaveBeenCalledWith(proofs)
  expect(mockFetchGigDetail).toHaveBeenCalledTimes(1)
})

test('a SUCCESSFUL submit leaves the re-read to the transaction monitor', async () => {
  mockGig = gigDetail({ status: 'accepted', counterparty: userRef(WORKER_ID) })
  mockViewerId = WORKER_ID
  render(<GigDetailScreen />)
  fireEvent.press(screen.getByText('Submit Proof'))
  mockFetchGigDetail.mockClear()
  mockActions.submit.mockResolvedValueOnce(true)

  await act(async () => {
    expect(await mockCapture.sheets?.onProofsReady([])).toBe(true)
  })

  expect(mockFetchGigDetail).not.toHaveBeenCalled()
})

test('added proof re-reads only when the transaction landed, and a dispute carries the bond', async () => {
  mockGig = gigDetail({ status: 'submitted', counterparty: userRef(WORKER_ID), dispute_bond_raw: '25000' })
  mockViewerId = CREATOR_ID
  render(<GigDetailScreen />)
  mockFetchGigDetail.mockClear()

  mockActions.addProofs.mockResolvedValueOnce(false)
  await act(async () => { await mockCapture.sheets?.onAddProofsReady([]) })
  expect(mockFetchGigDetail).not.toHaveBeenCalled()

  mockActions.addProofs.mockResolvedValueOnce(true)
  await act(async () => { await mockCapture.sheets?.onAddProofsReady([]) })
  expect(mockFetchGigDetail).toHaveBeenCalledTimes(1)

  mockActions.dispute.mockResolvedValueOnce(true)
  await act(async () => {
    expect(await mockCapture.sheets?.onDisputeReady('no proof')).toBe(true)
  })
  expect(mockActions.dispute).toHaveBeenCalledWith('no proof', '25000')
})

test('the accept nudge is for someone who can actually accept, and stays gone once dismissed', () => {
  const worker = render(<GigDetailScreen />)
  expect(worker.getByTestId('accept-nudge')).toBeTruthy()
  worker.unmount()

  // The poster's own gig teaches them nothing about accepting.
  mockViewerId = CREATOR_ID
  const poster = render(<GigDetailScreen />)
  expect(poster.queryByTestId('accept-nudge')).toBeNull()
  poster.unmount()

  mockViewerId = STRANGER_ID
  mockDismissedNudges.accept = true
  expect(render(<GigDetailScreen />).queryByTestId('accept-nudge')).toBeNull()
})

/**
 * Every wallet transition the screen can be asked to confirm, and the action it
 * must reach. The states these branches appear in are the CTA bar's own suite;
 * what is under test here is the switch that maps a confirmed dialog to a
 * signature — the place a copy-paste sends `unassign` to `cancel()`.
 */
const TRANSITIONS: readonly [EscrowTxType, keyof typeof mockActions, string[]][] = [
  ['accept', 'accept', []],
  ['approve', 'approve', []],
  ['claim_stalled', 'claim', []],
  ['cancel', 'cancel', []],
  ['refund_expired', 'refund', ['refund_expired']],
  ['reclaim_abandoned', 'refund', ['reclaim_abandoned']],
  ['unassign', 'unassign', []],
  ['decline', 'decline', []],
]

test.each(TRANSITIONS)('a confirmed %s signs through %s', (transition, method, args) => {
  render(<GigDetailScreen />)

  act(() => mockCapture.bar?.onTxAction(transition))
  expect(screen.getByTestId(`confirm:${transition}`)).toBeTruthy()
  act(() => mockCapture.confirm?.onConfirm())

  expect(mockActions[method]).toHaveBeenCalledWith(...args)
  // Exactly one action fired: a fallthrough would sign twice.
  const fired = Object.values(mockActions).filter(
    (value): value is jest.Mock => typeof value === 'function' && value.mock.calls.length > 0,
  )
  expect(fired).toHaveLength(1)
})

test('the chrome dismisses, and the draft CTA reopens the composer on that draft', () => {
  render(<GigDetailScreen />)

  fireEvent.press(screen.getByLabelText('Dismiss'))
  expect(mockBack).toHaveBeenCalledTimes(1)

  act(() => mockCapture.bar?.onRetryDraft())
  expect(mockPush).toHaveBeenCalledWith('/(tabs)/create-gig?draftId=escrow-1')
})

test("the body's affordances open the proof viewer, the report sheet and the dispute thread", () => {
  render(<GigDetailScreen />)
  const proof: MediaItem = { id: 'proof-1', url: 'https://cdn.test/proof.png', type: 'image' }

  act(() => mockCapture.body?.onProofPress(proof))
  expect(screen.getByTestId('media-viewer')).toBeTruthy()
  act(() => mockCapture.closeMedia())
  expect(mockCapture.media).toBeNull()

  act(() => mockCapture.body?.onReport())
  // Reporting a gig reports the ESCROW, which is what the moderation queue keys on.
  expect(screen.getByTestId('report:escrow:escrow-1')).toBeTruthy()
  act(() => mockCapture.closeReport())
  expect(mockCapture.reportOpen).toBe(false)

  act(() => mockCapture.body?.onOpenDisputeThread())
  expect(mockPush).toHaveBeenCalledWith('/dispute/escrow-1')
})

test('the transaction monitor reads THIS gig and refreshes through the store', async () => {
  render(<GigDetailScreen />)
  const { api } = require('@/api/client') as { api: { gigs: { get: jest.Mock } } }

  await act(async () => { await mockCapture.monitor?.readDetail() })
  expect(api.gigs.get).toHaveBeenCalledWith({ id: 'escrow-1' })

  act(() => mockCapture.monitor?.refresh())
  expect(mockFetchGigDetail).toHaveBeenCalledWith('escrow-1')
})

test('a submitted review re-reads the gig, so the CTA that offered it goes away', () => {
  render(<GigDetailScreen />)
  mockFetchGigDetail.mockClear()

  act(() => mockCapture.sheets?.onReviewSubmitted())

  expect(mockFetchGigDetail).toHaveBeenCalledWith('escrow-1')
})

test('dismissing the nudge closes it for this visit', () => {
  render(<GigDetailScreen />)
  expect(screen.getByTestId('accept-nudge')).toBeTruthy()

  act(() => mockCapture.closeNudge())

  expect(screen.queryByTestId('accept-nudge')).toBeNull()
})

test('a transition refused as taken down re-reads: the bar must stop offering it', () => {
  render(<GigDetailScreen />)
  // The escrow the hook signs FOR — chain and asset included, because a debit
  // is denominated in them and a wrong one would sign on the wrong network.
  expect(mockCapture.actionOptions).toMatchObject({
    escrowId: 'escrow-1',
    chainId: 'solana:devnet',
    asset: 'USDC_SOL',
    amountRaw: '1000000',
  })
  mockFetchGigDetail.mockClear()

  act(() => mockCapture.actionOptions?.onStale())

  expect(mockFetchGigDetail).toHaveBeenCalledWith('escrow-1')
})

test('the approval flow re-reads on change, and sends unassign through the confirm gate', () => {
  render(<GigDetailScreen />)
  expect(mockCapture.approvalOptions?.escrowId).toBe('escrow-1')
  mockFetchGigDetail.mockClear()

  act(() => mockCapture.approvalOptions?.onChanged())
  expect(mockFetchGigDetail).toHaveBeenCalledWith('escrow-1')

  // Unassign opens a WALLET, so it goes through the same gate as every other
  // signed transition rather than acting on the press.
  act(() => mockCapture.approvalOptions?.onRequestUnassign())
  expect(screen.getByTestId('confirm:unassign')).toBeTruthy()
  expect(mockActions.unassign).not.toHaveBeenCalled()
})

test('with no fee config and no stated duration, the dialog quotes neither rather than guessing', () => {
  mockGig = gigDetail({ completion_duration_seconds: null })
  mockFee.netRaw = null
  mockFee.feePct = null
  render(<GigDetailScreen />)

  act(() => mockCapture.bar?.onTxAction('accept'))

  // The gross amount is known from the escrow itself and still shows; the two
  // that depend on config or on a duration the gig does not carry are null,
  // not a zero or a placeholder.
  expect(mockCapture.confirm?.ctx).toMatchObject({
    amount: formatAssetAmount('1000000', 'USDC_SOL'),
    netAmount: null,
    feePct: null,
    deliverWithin: null,
  })
})

test('the escrow channel refreshes this gig when the counterparty acts', () => {
  render(<GigDetailScreen />)

  // Subscribed to THIS escrow, and told the status — the hook re-subscribes on
  // a transition, so passing a stale one would leave the screen listening to a
  // channel nobody publishes on any more.
  expect(mockLiveRefresh).toHaveBeenCalledWith('escrow-1', expect.any(Function), 'open')
  const refresh = mockLiveRefresh.mock.calls.at(-1)?.[1] as (() => void) | undefined
  mockFetchGigDetail.mockClear()

  act(() => refresh?.())

  expect(mockFetchGigDetail).toHaveBeenCalledWith('escrow-1')
})
