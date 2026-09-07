import { type ReactNode } from 'react'
import { View, StyleSheet } from 'react-native'
import { AlertTriangle } from 'lucide-react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing } from '@/theme/tokens'
import { Text } from './Text'
import { Button } from './Button'

interface ErrorStateProps {
  title?:       string
  description?: string
  onRetry?:     () => void
  icon?:        ReactNode
}

export function ErrorState({
  title       = 'Something went wrong',
  description = 'Check your connection and try again.',
  onRetry,
  icon,
}: ErrorStateProps) {
  const { theme } = useUnistyles()

  return (
    <View style={s.container}>
      <View style={s.icon}>
        {icon ?? <AlertTriangle size={36} color={theme.colors.feedback.warning.text} />}
      </View>
      <Text variant="subheading" align="center" color={theme.colors.feedback.warning.text}>
        {title}
      </Text>
      {description && (
        <Text variant="caption" align="center" color={theme.colors.content.secondary} style={s.description}>
          {description}
        </Text>
      )}
      {onRetry && (
        <Button variant="primary" size="md" onPress={onRetry} style={s.action}>
          Try again
        </Button>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex:               1,
    alignItems:         'center',
    justifyContent:     'center',
    paddingHorizontal:  spacing.xl,
    gap:                spacing.sm,
  },
  icon:        { marginBottom: spacing.sm },
  description: { marginTop: 2 },
  action:      { marginTop: spacing.md },
})
