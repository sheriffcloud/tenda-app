import { StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { StyleProp, TextStyle } from 'react-native'
import { Text } from './Text'
import { typography } from '@/theme/tokens'
import { getAppVersion } from '@/lib/app-version'

interface AppVersionProps {
  /** Space above the line; the two tab screens that use this differ only here. */
  marginTop?: number
  style?: StyleProp<TextStyle>
}

/**
 * The build identity footer ("Tenda v0.4.1 (1)").
 *
 * Settings and Profile each carried their own copy of this line with the
 * version hardcoded, which is how both came to advertise v1.0.0 for a binary
 * that had never been 1.0.0. One component, one source — the string is read
 * from the manifest, so it cannot be edited into a lie.
 */
export function AppVersion({ marginTop = 34, style }: AppVersionProps) {
  const { theme } = useUnistyles()
  return (
    <Text style={[s.version, { color: theme.colors.content.tertiary, marginTop }, style]}>
      {getAppVersion().label}
    </Text>
  )
}

const s = StyleSheet.create({
  version: {
    textAlign: 'center',
    fontFamily: typography.fonts.mono.regular,
    fontSize: 11,
    letterSpacing: 0.44,
  },
})
