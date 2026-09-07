import { useEffect, useRef, useState } from 'react'
import { AppState, Animated, View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { WifiOff } from 'lucide-react-native'
import { apiConfig } from '@tenda/shared'
import { LiveChip } from '@/components/ui/LiveChip'
import { Text } from '@/components/ui/Text'
import { getEnv } from '@/lib/env'
import { radius, spacing, typography } from '@/theme/tokens'

type Status = 'checking' | 'connected' | 'unreachable'

const POLL_INTERVAL_MS = 30_000
const FETCH_TIMEOUT_MS = 5_000

async function pingServer(): Promise<boolean> {
  const baseUrl = apiConfig[getEnv()].baseUrl
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}/v1/health`, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeoutId)
  }
}

export function ServerStatus() {
  const { theme } = useUnistyles()
  const [status, setStatus] = useState<Status>('checking')
  const opacity = useRef(new Animated.Value(0)).current
  const hasResolved = useRef(false)
  const appStateRef = useRef(AppState.currentState)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    function resolve(ok: boolean) {
      if (cancelled) return
      setStatus(ok ? 'connected' : 'unreachable')
      if (!hasResolved.current) {
        hasResolved.current = true
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start()
      }
    }

    function schedulePoll() {
      if (cancelled) return
      timer = setTimeout(() => {
        pingServer().then(resolve).finally(schedulePoll)
      }, POLL_INTERVAL_MS)
    }

    pingServer().then((ok) => {
      resolve(ok)
      schedulePoll()
    })

    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        if (timer) clearTimeout(timer)
        pingServer().then((ok) => {
          resolve(ok)
          schedulePoll()
        })
      }
      appStateRef.current = next
    })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      sub.remove()
    }
  }, [opacity])

  return (
    <Animated.View style={{ opacity }}>
      {status === 'unreachable' ? (
        <View style={[s.chip, { backgroundColor: theme.colors.feedback.warning.surface }]}>
          <WifiOff size={14} color={theme.colors.feedback.warning.text} />
          <Text size={typography.styles.caption.fontSize} weight="medium" color={theme.colors.feedback.warning.text}>
            Offline
          </Text>
        </View>
      ) : (
        // 'checking' renders LiveChip at opacity 0 to reserve space; 'connected' renders it visible
        <LiveChip label="Live" />
      )}
    </Animated.View>
  )
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
})
