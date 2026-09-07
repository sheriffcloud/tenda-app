import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { ReactNode } from 'react'
import { Text } from '@/components/ui'
import { Eyebrow } from '@/components/ui/Eyebrow'

interface InfoCardProps {
  /** Mono uppercase eyebrow at the top of the card. */
  label: string
  /** Plain string body, for richer content pass `children` instead. */
  body?: string
  children?: ReactNode
}

/**
 * Wireframe `sup-card` (§(support)). Border-only card with mono eyebrow +
 * body content. Used across all support articles for "What is X?" blocks.
 */
export function InfoCard({ label, body, children }: InfoCardProps) {
  const { theme } = useUnistyles()
  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
      ]}
    >
      <Eyebrow style={s.label}>{label}</Eyebrow>
      {body ? (
        <Text style={[s.body, { color: theme.colors.content.secondary }]}>{body}</Text>
      ) : null}
      {children}
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderRadius: 18,
  },
  label: {
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
  },
})
