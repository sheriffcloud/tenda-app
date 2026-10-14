import { useCallback, useEffect, useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { CheckCircle2, Clock, XCircle } from 'lucide-react-native'
import type { FiatIntentDetail } from '@tenda/shared'
import { ScreenContainer, Text, Header, Button, ConfirmDialog, showToast } from '@/components/ui'
import { LoadingScreen } from '@/components/feedback/LoadingScreen'
import { api } from '@/api/client'
import {
  ApiClientError,
  formatFiat,
  instructionCopy,
  INTENT_STATUS_COPY,
  isCancellable,
  isTerminal,
} from '@tenda/shared'
import { spacing } from '@/theme/tokens'

const POLL_MS = 10_000

/**
 * In-progress intent status (stage-8 § Mobile): resumable after an app
 * restart, the instruction persists on the intent. Polls while open;
 * push/WS settlement events land regardless.
 */
export default function FiatIntentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { theme } = useUnistyles()
  const [intent, setIntent] = useState<FiatIntentDetail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const detail = await api.fiat.intent({ id })
      setIntent(detail)
      if (!isTerminal(detail.status)) {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void load(), POLL_MS)
      }
    } catch (e) {
      if (e instanceof ApiClientError && e.statusCode === 404) setNotFound(true)
      // Transient errors: keep the last known state; next focus retries.
    }
  }, [id])

  useFocusEffect(
    useCallback(() => {
      void load()
      return () => {
        if (timer.current) clearTimeout(timer.current)
      }
    }, [load]),
  )

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function handleCancel() {
    if (!intent) return
    setCancelConfirm(true)
  }

  async function confirmCancel() {
    if (!intent) return
    setCancelling(true)
    try {
      await api.fiat.cancelIntent({ id: intent.id })
      setCancelConfirm(false)
      void load()
    } catch (e) {
      showToast('error', e instanceof ApiClientError ? e.message : 'Could not cancel')
    } finally {
      setCancelling(false)
    }
  }

  if (notFound) {
    return (
      <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
        <Header title="Transaction" showBack onBackPress={() => router.back()} />
        <Text size={13.5} align="center" style={s.missing} color={theme.colors.content.secondary}>
          This transaction no longer exists.
        </Text>
      </ScreenContainer>
    )
  }
  if (intent === null) return <LoadingScreen />

  const StatusIcon =
    intent.status === 'settled' ? CheckCircle2 : isTerminal(intent.status) ? XCircle : Clock
  const tone =
    intent.status === 'settled'
      ? theme.colors.feedback.success.base
      : isTerminal(intent.status)
        ? theme.colors.feedback.danger.base
        : theme.colors.brand.primary

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <Header title={intent.direction === 'onramp' ? 'Buy' : 'Cash-out'} showBack onBackPress={() => router.back()} />
      <View style={s.body}>
        <View style={s.statusBlock}>
          <StatusIcon size={44} color={tone} />
          <Text variant="subheading" align="center">{INTENT_STATUS_COPY[intent.status]}</Text>
          <Text size={13} color={theme.colors.content.secondary} align="center">
            {/* The intent's OWN currency: a KES or GHS cash-out showed a naira
                figure on the page a reader watches their money settle on. Same
                defect as #29 — money formatted by hand rather than through the
                shared helper. */}
            {formatFiat(Number(intent.fiat_amount), intent.fiat_currency)} ·{' '}
            {intent.provider}
          </Text>
        </View>

        {intent.instruction !== null && !isTerminal(intent.status) && (
          <View style={[s.instruction, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
            <Text size={13} style={s.instructionText}>{instructionCopy(intent.instruction)}</Text>
          </View>
        )}

        {isCancellable(intent.status) && (
          <Button variant="outline" size="md" fullWidth onPress={handleCancel}>
            Cancel transaction
          </Button>
        )}
      </View>

      <ConfirmDialog
        visible={cancelConfirm}
        title="Cancel this transaction?"
        message="You can always start a new one."
        confirmLabel="Cancel transaction"
        cancelLabel="Keep it"
        destructive
        loading={cancelling}
        onConfirm={() => void confirmCancel()}
        onCancel={() => setCancelConfirm(false)}
      />
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  body: { padding: spacing.md, gap: 16 },
  statusBlock: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  instruction: { borderWidth: 1, borderRadius: 14, padding: 14 },
  instructionText: { lineHeight: 19 },
  missing: { padding: spacing.lg },
})
