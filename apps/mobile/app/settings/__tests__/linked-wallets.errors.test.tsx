/**
 * Linked-wallets screen — the paths a reader hits when things go wrong or when
 * they change their mind: the generic fallback copy each action shows when a
 * failure carries no server message, and the ways back OUT of the picker and
 * the manage sheet.
 */
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native'
import {
  LinkedWalletsScreen,
  authState,
  linkMock,
  mockShowToast,
  setPrimaryMock,
  unlinkMock,
  SECONDARY,
} from '../__fixtures__/linked-wallets-harness'

describe('LinkedWalletsScreen, failures with no server message', () => {
  // Each of these paths reads the server's own words when it has them, and
  // falls back when it does not. The FALLBACK half was the uncovered one, and
  // it is the half a reader sees when the network breaks rather than the API.

  it('setting the main wallet for a chain', async () => {
    authState.wallets = [SECONDARY]
    setPrimaryMock.mockRejectedValue(new Error('socket hang up'))
    render(<LinkedWalletsScreen />)
    fireEvent.press(screen.getByText('manage-0xSecondary'))
    fireEvent.press(screen.getByText('Make main EVM wallet'))
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Could not update your main wallet'),
    )
  })

  it('unlinking a wallet', async () => {
    authState.wallets = [SECONDARY]
    unlinkMock.mockRejectedValue(new Error('socket hang up'))
    render(<LinkedWalletsScreen />)
    fireEvent.press(screen.getByText('manage-0xSecondary'))
    fireEvent.press(screen.getByText('Unlink wallet'))
    fireEvent.press(screen.getByText('Unlink'))
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Could not unlink the wallet'),
    )
  })
})

describe('LinkedWalletsScreen, ways OUT', () => {
  // Close and back handlers are easy to wire wrong and impossible to notice in
  // review: the sheet simply never shuts, and the reader is trapped on it.

  it('closes the wallet picker without linking anything', () => {
    render(<LinkedWalletsScreen />)
    fireEvent.press(screen.getByText('Add another wallet'))
    expect(screen.getByText('picker-visible')).toBeTruthy()
    fireEvent.press(screen.getByText('picker-close'))
    expect(screen.queryByText('picker-visible')).toBeNull()
    expect(linkMock).not.toHaveBeenCalled()
  })

  it('closes the manage sheet without touching the wallet', () => {
    authState.wallets = [SECONDARY]
    render(<LinkedWalletsScreen />)
    fireEvent.press(screen.getByText('manage-0xSecondary'))
    expect(screen.getByText('Unlink wallet')).toBeTruthy()
    fireEvent.press(screen.getByText('sheet-close'))
    expect(screen.queryByText('Unlink wallet')).toBeNull()
    expect(unlinkMock).not.toHaveBeenCalled()
    expect(setPrimaryMock).not.toHaveBeenCalled()
  })
})
