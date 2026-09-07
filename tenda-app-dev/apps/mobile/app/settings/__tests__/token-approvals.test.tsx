/**
 * Token-approvals screen (permit Stage D/E). Rows derive purely from the
 * chain registry (eip155 chains × ERC-20 assets, natives excluded), reads
 * go through readAllowance per row, and set/revoke ride sendApprove +
 * waitForReceipt with the shared ConfirmDialog/BottomSheet UX. Uses the REAL
 * AllowanceRow + displayToAmountRaw so formatting and input parsing are
 * covered; only the RPC/wallet boundary is mocked.
 */
import { act, render, fireEvent, waitFor, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  // Real useFocusEffect fires on focus; firing on mount (once) is the test
  // equivalent. Calling cb() bare on every render would loop via setRows.
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react')
    useEffect(() => cb(), [])
  },
}))

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { secondary: '#333' },
        border: { default: '#ccc' },
      },
    },
  }),
}))

jest.mock('@/components/ui', () => {
  const { Pressable, Text, TextInput, View } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => children,
    Header: () => null,
    Text: Text,
    Input: ({
      value,
      onChangeText,
      placeholder,
    }: {
      value: string
      onChangeText: (v: string) => void
      placeholder: string
    }) => <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} />,
    BottomSheet: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
      visible ? <View>{children}</View> : null,
    ConfirmDialog: ({
      visible,
      onConfirm,
      onCancel,
    }: {
      visible: boolean
      onConfirm: () => void
      onCancel: () => void
    }) =>
      visible ? (
        <View>
          <Pressable accessibilityRole="button" onPress={onCancel}>
            <Text>dialog-cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onConfirm}>
            <Text>dialog-confirm</Text>
          </Pressable>
        </View>
      ) : null,
    Button: ({ children, onPress, disabled }: { children: React.ReactNode; onPress: () => void; disabled?: boolean }) => (
      <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
    showToast: jest.fn(),
  }
})

// dispatch pulls the full adapter stack (Reown ESM), mock at the module edge.
jest.mock('@/wallet/dispatch', () => ({
  resolveEvmFrom: jest.fn(),
}))

// allowance's approve leg imports the walletconnect adapter; stub it so
// requireActual below can load the real pure helpers (displayToAmountRaw).
jest.mock('@/wallet/adapters/walletconnect', () => ({
  sendEvmTransaction: jest.fn(),
}))
// The allowance module moved to @tenda/shared (2026-08-15): partial mock —
// real pure helpers (displayToAmountRaw), spies for the RPC/wallet legs.
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  readAllowance: jest.fn(),
  sendApprove: jest.fn(),
  waitForReceipt: jest.fn(),
}))

jest.mock('@/stores/chain-registry.store', () => {
  const state: { chains: unknown } = { chains: null }
  const useChainRegistryStore = (selector: (s: typeof state) => unknown) => selector(state)
  useChainRegistryStore.getState = () => state
  return { useChainRegistryStore }
})

import TokenApprovalsScreen from '@/app/settings/token-approvals'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { resolveEvmFrom } from '@/wallet/dispatch'
import { readAllowance, sendApprove, waitForReceipt } from '@tenda/shared'
import { showToast } from '@/components/ui'
import type { ChainRegistryEntry } from '@tenda/shared'

const resolveEvmFromMock = resolveEvmFrom as jest.Mock
const readAllowanceMock = readAllowance as jest.Mock
const sendApproveMock = sendApprove as jest.Mock
const waitForReceiptMock = waitForReceipt as jest.Mock
const showToastMock = showToast as jest.Mock
const registryState = useChainRegistryStore.getState() as { chains: ChainRegistryEntry[] | null }

const OWNER = '0xOwner'
const BASE_SEPOLIA: ChainRegistryEntry = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xEscrow',
  assets: [
    {
      id: 'USDC_BASE_SEPOLIA',
      symbol: 'USDC',
      decimals: 6,
      is_stable: true,
      token_address: '0xUSDC',
      supports_permit: true,
    },
    // Native gas token, token_address null, must NOT produce a row.
    {
      id: 'ETH_BASE_SEPOLIA',
      symbol: 'ETH',
      decimals: 18,
      is_stable: false,
      token_address: null,
      supports_permit: false,
    },
  ],
}
const SOLANA_DEVNET: ChainRegistryEntry = {
  id: 'solana:devnet',
  namespace: 'solana',
  display_name: 'Solana Devnet',
  escrow_address: 'TendaProgram1111',
  assets: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  resolveEvmFromMock.mockReturnValue(OWNER)
  registryState.chains = [BASE_SEPOLIA, SOLANA_DEVNET]
  readAllowanceMock.mockResolvedValue('45000000')
  sendApproveMock.mockResolvedValue('0xApproveTx')
  waitForReceiptMock.mockResolvedValue('confirmed')
})

describe('TokenApprovalsScreen, states', () => {
  it('asks for an EVM wallet when none resolves; never reads', () => {
    resolveEvmFromMock.mockReturnValue(null)
    render(<TokenApprovalsScreen />)
    expect(screen.getByText('Link an EVM wallet to view its token approvals.')).toBeTruthy()
    expect(readAllowanceMock).not.toHaveBeenCalled()
  })

  it('shows loading (not "no chains") while the registry is still null', () => {
    registryState.chains = null
    render(<TokenApprovalsScreen />)
    expect(screen.getByText('Loading chains…')).toBeTruthy()
    expect(screen.queryByText('No EVM chains are enabled right now.')).toBeNull()
  })

  it('says so when only non-EVM chains are enabled', async () => {
    registryState.chains = [SOLANA_DEVNET]
    render(<TokenApprovalsScreen />)
    // The effect still runs `Promise.allSettled([])` over an empty row list and
    // calls setRows a second time when it resolves. Nothing on screen changes,
    // so there is no text to waitFor — flush the microtask inside act, and
    // assert against the render React has actually finished committing.
    await act(async () => {})
    expect(screen.getByText('No EVM chains are enabled right now.')).toBeTruthy()
    expect(readAllowanceMock).not.toHaveBeenCalled()
  })
})

describe('TokenApprovalsScreen, rows from the registry', () => {
  it('renders one row per ERC-20 asset (natives excluded) and reads its allowance', async () => {
    render(<TokenApprovalsScreen />)
    await waitFor(() => expect(screen.getByText('45 USDC')).toBeTruthy())
    expect(screen.getByText('USDC · Base Sepolia')).toBeTruthy()
    expect(screen.queryByText(/ETH ·/)).toBeNull()
    expect(readAllowanceMock).toHaveBeenCalledTimes(1)
    expect(readAllowanceMock).toHaveBeenCalledWith({
      chainId: 'eip155:84532',
      token: '0xUSDC',
      owner: OWNER,
      spender: '0xEscrow',
    })
  })

  it('a failed read shows "Unavailable", never a fake zero', async () => {
    readAllowanceMock.mockRejectedValue(new Error('rpc down'))
    render(<TokenApprovalsScreen />)
    await waitFor(() => expect(screen.getByText('Unavailable')).toBeTruthy())
    expect(screen.queryByText('No standing approval')).toBeNull()
  })

  it('a zero allowance shows "No standing approval" and hides Revoke', async () => {
    readAllowanceMock.mockResolvedValue('0')
    render(<TokenApprovalsScreen />)
    await waitFor(() => expect(screen.getByText('No standing approval')).toBeTruthy())
    expect(screen.queryByText('Revoke')).toBeNull()
  })
})

describe('TokenApprovalsScreen, set a custom limit', () => {
  async function openSetSheet() {
    render(<TokenApprovalsScreen />)
    await waitFor(() => expect(screen.getByText('45 USDC')).toBeTruthy())
    fireEvent.press(screen.getByText('Set'))
    return screen.getByPlaceholderText('Amount in USDC')
  }

  it('parses the typed amount with the asset decimals and approves it', async () => {
    const input = await openSetSheet()
    fireEvent.changeText(input, '12.5')
    fireEvent.press(screen.getByText('Approve'))
    await waitFor(() =>
      expect(sendApproveMock).toHaveBeenCalledWith({
        chainId: 'eip155:84532',
        token: '0xUSDC',
        spender: '0xEscrow',
        amountRaw: '12500000',
        from: OWNER,
        // The screen binds its wallet transport into the shared module — the
        // approve must ride the connected session, never a bare RPC.
        sendTx: expect.any(Function),
      }),
    )
    // doneMsg captures the typed amount BEFORE the input resets.
    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith('success', 'Approval set to 12.5 USDC'),
    )
  })

  it('rejects an unparseable amount without touching the wallet', async () => {
    const input = await openSetSheet()
    fireEvent.changeText(input, 'abc')
    fireEvent.press(screen.getByText('Approve'))
    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith(
        'error',
        'Enter a valid USDC amount (max 6 decimals)',
      ),
    )
    expect(sendApproveMock).not.toHaveBeenCalled()
  })

  it('surfaces a reverted approve as an error toast', async () => {
    waitForReceiptMock.mockResolvedValue('reverted')
    const input = await openSetSheet()
    fireEvent.changeText(input, '1')
    fireEvent.press(screen.getByText('Approve'))
    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith('error', 'The approval transaction reverted'),
    )
  })
})

describe('TokenApprovalsScreen, revoke', () => {
  it('confirms first, then approves zero', async () => {
    render(<TokenApprovalsScreen />)
    await waitFor(() => expect(screen.getByText('Revoke')).toBeTruthy())
    fireEvent.press(screen.getByText('Revoke'))
    fireEvent.press(screen.getByText('dialog-confirm'))
    await waitFor(() =>
      expect(sendApproveMock).toHaveBeenCalledWith(
        expect.objectContaining({ amountRaw: '0', token: '0xUSDC' }),
      ),
    )
    await waitFor(() => expect(showToastMock).toHaveBeenCalledWith('success', 'Approval revoked'))
  })

  it('cancelling the dialog never sends', async () => {
    render(<TokenApprovalsScreen />)
    await waitFor(() => expect(screen.getByText('Revoke')).toBeTruthy())
    fireEvent.press(screen.getByText('Revoke'))
    fireEvent.press(screen.getByText('dialog-cancel'))
    expect(sendApproveMock).not.toHaveBeenCalled()
  })
})
