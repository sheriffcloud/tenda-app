import { useEffect, useRef } from 'react'
import { useRouter, type Href } from 'expo-router'
import { spacing } from '@/theme/tokens'
import { BottomSheet, Text, Button, Spacer } from '@/components/ui'
import { useOnboardingStore } from '@/stores/onboarding.store'
import type { NudgeKey } from '@/stores/onboarding.store'

interface NudgeSheetProps {
  visible: boolean
  nudgeKey: NudgeKey
  title: string
  body: string
  guideRoute: Href
  onClose: () => void
}

export function NudgeSheet({ visible, nudgeKey, title, body, guideRoute, onClose }: NudgeSheetProps) {
  const router = useRouter()
  const { dismissNudge } = useOnboardingStore()
  const dismissalInFlight = useRef(false)

  useEffect(() => {
    if (!visible) dismissalInFlight.current = false
  }, [visible])

  async function persistDismissal() {
    try {
      await dismissNudge(nudgeKey)
    } catch {
      // Persistence is best-effort; a storage failure must not trap the user.
    }
  }

  async function handleDismiss() {
    if (dismissalInFlight.current) return
    dismissalInFlight.current = true
    await persistDismissal()
    onClose()
  }

  async function handleShowGuide() {
    if (dismissalInFlight.current) return
    dismissalInFlight.current = true
    await persistDismissal()
    onClose()
    router.push(guideRoute)
  }

  return (
    <BottomSheet visible={visible} onClose={handleDismiss} title={title}>
      <Text variant="body">{body}</Text>
      <Spacer size={spacing.lg} />
      <Button variant="primary" size="lg" fullWidth onPress={handleShowGuide}>
        Show me how
      </Button>
      <Spacer size={spacing.sm} />
      <Button variant="ghost" size="lg" fullWidth onPress={handleDismiss}>
        Got it
      </Button>
    </BottomSheet>
  )
}
