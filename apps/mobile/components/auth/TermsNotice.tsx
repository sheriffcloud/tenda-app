import { Linking, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from '@/components/ui/Text'
import { APP_INFO } from '@/lib/app-info'

/**
 * Shared "By {verb} you agree to our Terms and Privacy" line for the auth
 * screens. Terms/Privacy are real links (APP_INFO.legal), previously the
 * welcome copy was inert. `verb` distinguishes "continuing" (welcome) from
 * "connecting" (wallet). Imports Text from its concrete path so screens that
 * mock @/components/ui/Text in jest keep rendering the stub.
 */
export function TermsNotice({ verb }: { verb: 'continuing' | 'connecting' }) {
  const { theme } = useUnistyles()
  return (
    <Text style={[s.tos, { color: theme.colors.content.tertiary }]}>
      By {verb} you agree to our{' '}
      <Text
        style={s.tosBold}
        color={theme.colors.content.secondary}
        onPress={() => Linking.openURL(APP_INFO.legal.terms)}
      >
        Terms
      </Text>
      {' '}and{' '}
      <Text
        style={s.tosBold}
        color={theme.colors.content.secondary}
        onPress={() => Linking.openURL(APP_INFO.legal.privacy)}
      >
        Privacy
      </Text>
      .
    </Text>
  )
}

const s = StyleSheet.create({
  tos: { fontSize: 11.5, lineHeight: 17, textAlign: 'center', paddingHorizontal: 20 },
  tosBold: { fontWeight: '600' },
})
