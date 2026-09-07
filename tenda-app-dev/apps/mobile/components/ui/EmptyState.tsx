import { type ReactNode } from 'react'
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from './Text'
import { Button } from './Button'

type Variant = 'default' | 'compact'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  variant?: Variant
  action?: {
    label: string
    onPress: () => void
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 14,
  },
  containerCompact: {
    paddingHorizontal: 24,
    paddingVertical: 48,
    gap: 12,
  },
  iconTile: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconTileCompact: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.17,
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    lineHeight: 19.5,
    textAlign: 'center',
    maxWidth: 260,
  },
  action: {
    marginTop: 10,
  },
})

export function EmptyState({ icon, title, description, variant = 'default', action }: EmptyStateProps) {
  const { theme } = useUnistyles()
  const isCompact = variant === 'compact'

  return (
    <View style={[s.container, isCompact && s.containerCompact]}>
      {icon && (
        <View
          style={[
            isCompact ? s.iconTileCompact : s.iconTile,
            isCompact
              ? { borderColor: theme.colors.content.tertiary }
              : { backgroundColor: theme.colors.brand.primarySurface },
          ]}
        >
          {icon}
        </View>
      )}
      <Text style={[s.title, { color: theme.colors.content.primary }]}>{title}</Text>
      {description && (
        <Text style={[s.description, { color: theme.colors.content.secondary }]}>
          {description}
        </Text>
      )}
      {action && (
        <Button variant="primary" size="md" onPress={action.onPress} style={s.action}>
          {action.label}
        </Button>
      )}
    </View>
  )
}
