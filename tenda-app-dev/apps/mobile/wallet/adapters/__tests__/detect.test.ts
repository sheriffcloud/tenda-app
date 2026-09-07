/**
 * Scheme probing. The comment on `canOpenScheme` records the Android 11+
 * behaviour that makes the try/catch load-bearing: an undeclared scheme makes
 * `canOpenURL` reject, and a rejection must read as "not installed" rather
 * than crash the picker while it is deciding what to show.
 */
import { Linking } from 'react-native'
import { canOpenScheme } from '../detect'

const canOpenURL = Linking.canOpenURL as jest.MockedFunction<typeof Linking.canOpenURL>

describe('canOpenScheme', () => {
  beforeEach(() => canOpenURL.mockReset())

  it('probes the scheme with a trailing :// and reports true when installed', async () => {
    canOpenURL.mockResolvedValue(true)
    await expect(canOpenScheme('phantom')).resolves.toBe(true)
    expect(canOpenURL).toHaveBeenCalledWith('phantom://')
  })

  it('reports false when the wallet is absent', async () => {
    canOpenURL.mockResolvedValue(false)
    await expect(canOpenScheme('phantom')).resolves.toBe(false)
  })

  it('treats a rejection as "not installed" rather than propagating it', async () => {
    canOpenURL.mockRejectedValue(new Error('not declared in queries'))
    await expect(canOpenScheme('solflare')).resolves.toBe(false)
  })
})
