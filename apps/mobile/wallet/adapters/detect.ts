import { Linking } from 'react-native'

/**
 * Whether a wallet app responding to `<scheme>://` is installed on the device.
 * Requires the scheme to be declared in `with-wallet-queries`, without it,
 * Android 11+ silently returns false even when the wallet is present.
 */
export async function canOpenScheme(scheme: string): Promise<boolean> {
  try {
    return await Linking.canOpenURL(`${scheme}://`)
  } catch {
    return false
  }
}
