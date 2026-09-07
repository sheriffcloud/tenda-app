import { useRouter } from 'expo-router'
import { ScreenContainer } from '@/components/ui/ScreenContainer'
import { ErrorState } from '@/components/feedback/ErrorState'

export default function ErrorRoute() {
  const router = useRouter()

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right']}>
      <ErrorState
        title="Unexpected error"
        description="Something went wrong on our end. Please try again."
        ctaLabel="Back to sign in"
        onCtaPress={() => router.replace('/(auth)/get-started')}
      />
    </ScreenContainer>
  )
}
