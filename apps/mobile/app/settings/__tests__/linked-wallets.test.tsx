/**
 * Linked-wallets screen — the two primary flows: adding a wallet through the
 * picker, and managing the ones already linked. Failure-copy and dismissal
 * paths live in linked-wallets.errors.test.tsx; the mocks both files share
 * live in __fixtures__/linked-wallets-harness.
 */
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native'
import { ApiClientError, ErrorCode, WalletError } from '@tenda/shared'
import {
  LinkedWalletsScreen,
  authState,
  mockAdapter,
  linkMock,
  mockReturnToLinkedWallets,
  mockShowToast,
  openPickerAndSelect,
  setPrimaryMock,
  unlinkMock,
  PRIMARY,
  SECONDARY,
} from '../__fixtures__/linked-wallets-harness'

describe('LinkedWalletsScreen, add wallet', () => {
  it('opens the picker on "Add another wallet"', () => {
    render(<LinkedWalletsScreen />)
    expect(screen.queryByText('picker-visible')).toBeNull()
    fireEvent.press(screen.getByText('Add another wallet'))
    expect(screen.getByText('picker-visible')).toBeTruthy()
  })

  it('links the selected adapter and returns to the screen on success', async () => {
    linkMock.mockResolvedValue(true)
    render(<LinkedWalletsScreen />)
    openPickerAndSelect()
    await waitFor(() => expect(linkMock).toHaveBeenCalledWith(mockAdapter))
    expect(mockShowToast).toHaveBeenCalledWith('success', 'Wallet linked')
    // Rebuild the stack onto linked-wallets in case the auto-return popped it.
    expect(mockReturnToLinkedWallets).toHaveBeenCalled()
  })

  it('toasts when the wallet prompt is closed (decline → false) and does not navigate', async () => {
    linkMock.mockResolvedValue(false)
    render(<LinkedWalletsScreen />)
    openPickerAndSelect()
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Wallet prompt was closed'),
    )
    expect(mockReturnToLinkedWallets).not.toHaveBeenCalled()
  })

  it('toasts a friendly message when no wallet app is installed', async () => {
    linkMock.mockRejectedValue(new WalletError('no_wallet', 'none'))
    render(<LinkedWalletsScreen />)
    openPickerAndSelect()
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('error', 'No wallet app installed'),
    )
  })

  it('surfaces a server error message verbatim', async () => {
    linkMock.mockRejectedValue(new ApiClientError(409, 'Conflict', 'already linked'))
    render(<LinkedWalletsScreen />)
    openPickerAndSelect()
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('error', 'already linked'))
  })

  it('still says something when the failure carries no server message', async () => {
    // A socket hang-up is neither a WalletError nor an ApiClientError. Without
    // this fallback the reader gets silence after tapping Link.
    linkMock.mockRejectedValue(new Error('socket hang up'))
    render(<LinkedWalletsScreen />)
    openPickerAndSelect()
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'error',
        'Could not link the wallet, please try again',
      ),
    )
  })
})

describe('LinkedWalletsScreen, manage wallets', () => {
  it('renders a card per linked wallet', () => {
    authState.wallets = [PRIMARY, SECONDARY]
    render(<LinkedWalletsScreen />)
    expect(screen.getByText('manage-0xPrimary')).toBeTruthy()
    expect(screen.getByText('manage-0xSecondary')).toBeTruthy()
  })

  it('sets a wallet as the MAIN one for its chain', async () => {
    authState.wallets = [SECONDARY]
    setPrimaryMock.mockResolvedValue({})
    render(<LinkedWalletsScreen />)
    fireEvent.press(screen.getByText('manage-0xSecondary'))
    fireEvent.press(screen.getByText('Make main EVM wallet'))
    await waitFor(() =>
      expect(setPrimaryMock).toHaveBeenCalledWith({ chain_ns: 'eip155', address: '0xSecondary' }),
    )
    expect(mockShowToast).toHaveBeenCalledWith('success', 'Main EVM wallet updated')
  })

  it('confirms then unlinks a wallet', async () => {
    authState.wallets = [SECONDARY]
    unlinkMock.mockResolvedValue({})
    render(<LinkedWalletsScreen />)
    fireEvent.press(screen.getByText('manage-0xSecondary'))
    fireEvent.press(screen.getByText('Unlink wallet')) // menu item → opens the dialog
    fireEvent.press(screen.getByText('Unlink')) // dialog confirm button
    await waitFor(() =>
      expect(unlinkMock).toHaveBeenCalledWith({ chain_ns: 'eip155', address: '0xSecondary' }),
    )
    expect(mockShowToast).toHaveBeenCalledWith('success', 'Wallet unlinked')
  })

  it('cancelling the confirm dialog does NOT unlink', async () => {
    authState.wallets = [SECONDARY]
    render(<LinkedWalletsScreen />)
    fireEvent.press(screen.getByText('manage-0xSecondary'))
    fireEvent.press(screen.getByText('Unlink wallet'))
    fireEvent.press(screen.getByText('Cancel')) // dismiss the dialog
    expect(unlinkMock).not.toHaveBeenCalled()
  })

  it('explains the WALLET_IN_USE (active escrow) guard on unlink failure', async () => {
    authState.wallets = [SECONDARY]
    unlinkMock.mockRejectedValue(new ApiClientError(409, 'Conflict', 'in use', ErrorCode.WALLET_IN_USE))
    render(<LinkedWalletsScreen />)
    fireEvent.press(screen.getByText('manage-0xSecondary'))
    fireEvent.press(screen.getByText('Unlink wallet'))
    fireEvent.press(screen.getByText('Unlink'))
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'error',
        'This wallet is part of an active escrow, finish or cancel it first',
      ),
    )
  })

  it('explains the WALLET_IS_PRIMARY guard distinctly (not the escrow copy)', async () => {
    authState.wallets = [SECONDARY]
    unlinkMock.mockRejectedValue(new ApiClientError(409, 'Conflict', 'is primary', ErrorCode.WALLET_IS_PRIMARY))
    render(<LinkedWalletsScreen />)
    fireEvent.press(screen.getByText('manage-0xSecondary'))
    fireEvent.press(screen.getByText('Unlink wallet'))
    fireEvent.press(screen.getByText('Unlink'))
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'error',
        'Make another wallet the main one for this chain first, then unlink this one',
      ),
    )
  })
})
