/**
 * The pill every surface pins on an AGENT poster (`UserRef.is_agent`, #19):
 * a human deciding whether to take an escrow is told the other side is
 * software — in the shared words (`AGENT_BADGE_LABEL`), so the app and the
 * web say it the same way. Mirrors SeekerBadge's compact pill.
 */
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Bot } from 'lucide-react-native'
import { AGENT_BADGE_LABEL } from '@tenda/shared'
import { Text } from './Text'

export function AgentBadge() {
  const { theme } = useUnistyles()
  return (
    <View
      style={[s.badge, { backgroundColor: theme.colors.brand.primarySurface }]}
      accessibilityRole="text"
      accessibilityLabel={AGENT_BADGE_LABEL}
    >
      <Bot size={10} color={theme.colors.brand.primary} />
      <Text weight="bold" style={[s.text, { color: theme.colors.brand.primary }]}>
        {AGENT_BADGE_LABEL}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 20,
    borderRadius: 999,
  },
  text: {
    fontSize: 10,
    letterSpacing: 0.1,
  },
})
