import type { ReactNode } from 'react'
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { LucideIcon } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui'

interface OnboardingSlideProps {
  Icon: LucideIcon
  title: string
  body: string
  children?: ReactNode
}

export function OnboardingSlide({ Icon, title, body, children }: OnboardingSlideProps) {
  const { theme } = useUnistyles()

  return (
    <View style={s.slide}>
      <View style={s.core}>
        <View style={[s.iconCircle, { backgroundColor: theme.colors.brand.primarySurface }]}>
          <Icon size={36} color={theme.colors.brand.primary} />
        </View>
        <Text style={[s.title, { color: theme.colors.content.primary }]}>{title}</Text>
        <Text style={[s.body, { color: theme.colors.content.secondary }]}>{body}</Text>
      </View>

      {children && <View style={s.extra}>{children}</View>}
    </View>
  )
}

const s = StyleSheet.create({
  slide: {
    flex: 1,
  },
  core: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 8,
    gap: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontFamily: typography.fonts.display.bold,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.56,
    textAlign: 'center',
    maxWidth: 320,
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 320,
  },
  extra: {
    width: '100%',
  },
})
