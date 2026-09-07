import { useState } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Briefcase, ShieldCheck, Smartphone, Wallet } from 'lucide-react-native'
import { spacing } from '@/theme/tokens'
import { ScreenContainer, Text, Button, Spacer } from '@/components/ui'
import { OnboardingSlide } from '@/components/onboarding/OnboardingSlide'
import { OnboardingDots } from '@/components/onboarding/OnboardingDots'
import { useOnboardingStore } from '@/stores/onboarding.store'

const SLIDES = [
  {
    Icon: Briefcase,
    title: 'Get paid for work you do',
    body: 'Find gigs or post work. The payment is locked in escrow before anyone starts so you always get paid.',
  },
  {
    Icon: ShieldCheck,
    title: 'How payment works',
    body: 'The client pays upfront into escrow, a trusted lockbox. You deliver, they approve, and the money is released straight to you.',
  },
  {
    Icon: Smartphone,
    title: 'Sign up in seconds',
    body: 'Use your phone, email, Google, or Apple. No crypto experience needed to get started.',
  },
  {
    Icon: Wallet,
    title: 'Your money, your control',
    body: 'When you’re ready to get paid, link a self-custody wallet. It’s free, instant, and only you control it.',
  },
] as const

export default function OnboardingScreen() {
  const router = useRouter()
  const { theme } = useUnistyles()
  const { completeOnboarding } = useOnboardingStore()
  const [slideIndex, setSlideIndex] = useState(0)

  const isLastSlide = slideIndex === SLIDES.length - 1

  async function handleFinish() {
    await completeOnboarding()
    // "Learn more" lands on the multi-method entry, not wallet-connect, an
    // account is born from a contact method (decision #3), wallet links later.
    router.replace('/(auth)/get-started')
  }

  function handleNext() {
    // Notification permission is deliberately NOT asked here. This screen runs
    // pre-account, so the system dialog would be spent before the user has
    // anything to be notified about, and on iOS it can never be shown again.
    // The ask now lives in NotificationPrimerHost, after signup.
    if (isLastSlide) void handleFinish()
    else setSlideIndex((i) => i + 1)
  }

  const currentSlide = SLIDES[slideIndex]

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <View style={s.screen}>
        {/* Skip */}
        <View style={s.topBar}>
          <Pressable onPress={handleFinish} style={s.skipBtn}>
            <Text variant="caption" color={theme.colors.content.secondary}>Skip</Text>
          </Pressable>
        </View>

        {/* Slide */}
        <Animated.View
          key={slideIndex}
          entering={FadeInRight.duration(280)}
          exiting={FadeOutLeft.duration(180)}
          style={s.slideWrapper}
        >
          <OnboardingSlide Icon={currentSlide.Icon} title={currentSlide.title} body={currentSlide.body} />
        </Animated.View>

        {/* Bottom controls */}
        <View style={s.bottom}>
          <OnboardingDots total={SLIDES.length} current={slideIndex} />
          <Spacer size={spacing.md} />
          <Button variant="primary" size="lg" fullWidth onPress={handleNext}>
            {isLastSlide ? 'Get started' : 'Next'}
          </Button>
          <Spacer size={spacing.md} />
        </View>
      </View>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  slideWrapper: { flex: 1 },
  topBar: { alignItems: 'flex-end', paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  skipBtn: { padding: spacing.xs },
  bottom: { paddingHorizontal: spacing.md, alignItems: 'center' },
})
