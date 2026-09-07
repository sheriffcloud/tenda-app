import { View, StyleSheet } from 'react-native'
import { useRouter, Stack } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Compass } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { ScreenContainer } from '@/components/ui/ScreenContainer'
import { Text } from '@/components/ui/Text'
import { Button } from '@/components/ui/Button'
import { Spacer } from '@/components/ui/Spacer'

export default function NotFoundScreen() {
  const router = useRouter()
  const { theme } = useUnistyles()

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenContainer scroll={false} edges={['left', 'right']}>
        <View style={s.container}>
          <View style={[s.iconCircle, { backgroundColor: theme.colors.brand.primarySurface }]}>
            <Compass size={36} color={theme.colors.brand.primary} strokeWidth={2} />
          </View>

          <Spacer size={20} />

          <Text style={[s.errorCode, { color: theme.colors.content.tertiary }]}>404</Text>
          <Spacer size={6} />
          <Text style={[s.title, { color: theme.colors.content.primary }]}>Page not found</Text>
          <Spacer size={10} />
          <Text style={[s.desc, { color: theme.colors.content.secondary }]}>
            This screen doesn&apos;t exist or has moved. Head back home and try a different path.
          </Text>

          <Spacer size={28} />

          <Button variant="primary" size="lg" onPress={() => router.replace('/(tabs)/home')}>
            Back to home
          </Button>
        </View>
      </ScreenContainer>
    </>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCode: {
    fontFamily: typography.fonts.mono,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.44,
    textAlign: 'center',
  },
  desc: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 300,
  },
})
