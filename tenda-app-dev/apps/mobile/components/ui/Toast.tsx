import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUnistyles } from 'react-native-unistyles'
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react-native'
import type { ColorScheme } from '@/theme/tokens'
import { Text } from './Text'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface ToastMessage {
  id: number
  variant: ToastVariant
  message: string
  duration?: number
}

const FEEDBACK_KEY: Record<ToastVariant, keyof ColorScheme['feedback']> = {
  success: 'success',
  error: 'danger',
  warning: 'warning',
  info: 'info',
}

const ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

let toastListener: ((msg: ToastMessage) => void) | null = null
let nextId = 0

export function showToast(variant: ToastVariant, message: string, duration = 3000) {
  toastListener?.({ id: nextId++, variant, message, duration })
}

export function useToast() {
  return { showToast }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const insets = useSafeAreaInsets()
  const { theme } = useUnistyles()
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  useEffect(() => {
    const activeTimers = timers.current
    toastListener = (msg) => {
      setToasts((prev) => [...prev, msg])
      const timer = setTimeout(() => removeToast(msg.id), msg.duration ?? 3000)
      activeTimers.set(msg.id, timer)
    }
    return () => {
      toastListener = null
      activeTimers.forEach(clearTimeout)
    }
  }, [removeToast])

  return (
    <View style={{ flex: 1 }}>
      {children}
      <View
        style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, gap: 8, zIndex: 9999 }}
        pointerEvents="box-none"
      >
        {toasts.map((toast) => {
          const tone = theme.colors.feedback[FEEDBACK_KEY[toast.variant]]
          const Icon = ICONS[toast.variant]
          return (
            <Animated.View
              key={toast.id}
              entering={FadeInUp.duration(200)}
              exiting={FadeOutUp.duration(200)}
            >
              <Pressable
                style={{
                  height: 48,
                  backgroundColor: theme.colors.surface.card,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.08,
                  shadowRadius: 24,
                  elevation: 4,
                }}
                onPress={() => removeToast(toast.id)}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: tone.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={12} color={tone.base} />
                </View>
                <Text size={13.5} color={theme.colors.content.primary} style={{ flex: 1 }}>
                  {toast.message}
                </Text>
              </Pressable>
            </Animated.View>
          )
        })}
      </View>
    </View>
  )
}
