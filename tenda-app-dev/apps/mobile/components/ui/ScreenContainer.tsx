import { type ReactNode } from 'react'
import { ScrollView, View, StyleSheet } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { useUnistyles } from 'react-native-unistyles'
import { spacing } from '@/theme/tokens'

interface ScreenContainerProps {
  scroll?: boolean
  padding?: boolean
  edges?: Edge[]
  children: ReactNode
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  padded: { paddingHorizontal: spacing.md },
})

export function ScreenContainer({
  scroll = true,
  padding = true,
  edges = ['left', 'right'],
  children,
}: ScreenContainerProps) {
  const { theme } = useUnistyles()

  const content = padding ? <View style={s.padded}>{children}</View> : children

  return (
    <SafeAreaView style={[s.flex, { backgroundColor: theme.colors.surface.background }]} edges={edges}>
      {scroll ? (
        <ScrollView
          style={s.flex}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        <View style={s.flex}>{content}</View>
      )}
    </SafeAreaView>
  )
}
