/**
 * WC return trampoline: pops itself so a wallet round-trip lands back on the
 * launching screen (warm return), and falls through to `/` on a cold start
 * where there is no stack to pop. Also pins the config invariant that the
 * redirect URL wallets are given actually targets this route.
 */
import { render } from '@testing-library/react-native'

const mockBack = jest.fn()
const mockReplace = jest.fn()
let mockCanGoBack = true
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockCanGoBack,
  }),
}))

import WcReturn from '@/app/wc-return'
import { WC_RETURN_URL, metadata } from '@/wallet/config'

beforeEach(() => {
  mockBack.mockReset()
  mockReplace.mockReset()
})

test('warm return pops back to the screen that opened the wallet', () => {
  mockCanGoBack = true
  render(<WcReturn />)
  expect(mockBack).toHaveBeenCalledTimes(1)
  expect(mockReplace).not.toHaveBeenCalled()
})

test('cold start (nothing to pop) falls through to the index route', () => {
  mockCanGoBack = false
  render(<WcReturn />)
  expect(mockReplace).toHaveBeenCalledWith('/')
  expect(mockBack).not.toHaveBeenCalled()
})

test('renders nothing while it exists (no flash between push and pop)', () => {
  mockCanGoBack = true
  const { toJSON } = render(<WcReturn />)
  expect(toJSON()).toBeNull()
})

test('the redirect URL wallets receive targets exactly this route', () => {
  // app/wc-return.tsx ⇒ path 'wc-return'; the config constant must agree or
  // wallets would deep-link to +not-found.
  expect(WC_RETURN_URL).toBe(`${metadata.redirectScheme}://wc-return`)
})
