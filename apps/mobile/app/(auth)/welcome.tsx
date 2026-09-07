import { View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { ScreenContainer } from '@/components/ui/ScreenContainer'
import { Text } from '@/components/ui/Text'
import { Button } from '@/components/ui/Button'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { TermsNotice } from '@/components/auth/TermsNotice'

export default function WelcomeScreen() {
  const router = useRouter()
  const { theme } = useUnistyles()

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <View style={[s.screen, { backgroundColor: theme.colors.surface.background }]}>
        <View style={s.heroStack}>
          <View style={[s.logoWrap, { shadowColor: theme.colors.brand.primary }]}>
            <BrandLogo size={80} />
          </View>

          <Text style={[s.heroTitle, { color: theme.colors.content.primary }]}>
            Work. Earn. Instantly.
          </Text>

          <Text style={[s.heroBody, { color: theme.colors.content.secondary }]}>
            {'Find gigs. Complete tasks.\nGet paid in seconds.'}
          </Text>
        </View>

        <View style={s.ctaStack}>
          <Button
            variant="primary"
            size="xl"
            fullWidth
            onPress={() => router.push('/(auth)/get-started')}
          >
            Get started
          </Button>
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            onPress={() => router.push('/onboarding')}
          >
            Learn more
          </Button>
          <TermsNotice verb="continuing" />
        </View>
      </View>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
  },
  heroStack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 32,
  },
  logoWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.20,
    shadowRadius: 24,
    elevation: 6,
  },
  heroTitle: {
    fontFamily: typography.fonts.display.bold,
    fontSize: 44,
    lineHeight: 46,
    fontWeight: '700',
    letterSpacing: -1.32,
    textAlign: 'center',
    marginBottom: 14,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 280,
  },
  ctaStack: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 12,
  },
})
