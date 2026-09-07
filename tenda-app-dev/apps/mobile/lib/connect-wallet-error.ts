/**
 * RN binding over the shared wallet-connect error copy table
 * (@tenda/shared classifyConnectError): passes __DEV__ as the dev-detail
 * seam and turns the copy's `secondaryUrl` into a Linking press handler.
 */
import { Linking } from 'react-native'
import { classifyConnectError as classifyShared } from '@tenda/shared'

export type ConnectError = {
  title: string
  description: string
  secondaryLabel?: string
  onSecondaryPress?: () => void
}

export function classifyConnectError(error: unknown): ConnectError {
  const copy = classifyShared(error, { devDetail: __DEV__ })
  const { secondaryLabel, secondaryUrl } = copy
  if (secondaryLabel === undefined || secondaryUrl === undefined) {
    return { title: copy.title, description: copy.description }
  }
  return {
    title: copy.title,
    description: copy.description,
    secondaryLabel,
    onSecondaryPress: () => void Linking.openURL(secondaryUrl),
  }
}
