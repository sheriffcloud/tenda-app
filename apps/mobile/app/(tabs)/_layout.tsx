import { useState, useRef } from 'react'
import { Tabs, useRouter } from 'expo-router'
import { Animated, StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import {
  useSafeAreaInsets,
  initialWindowMetrics
} from 'react-native-safe-area-context'
import {
  Home, Plus, Wallet, MessageCircle,
  ArrowLeftRight, ClipboardList, Coins
} from 'lucide-react-native'
import { typography, shadows } from '@/theme/tokens'
import {
  useChatStore,
  usePendingSyncStore,
} from '@/stores'
import { useInboxRealtime, useNotificationsRealtime } from '@/hooks'
import { FabMenu } from '@/components/ui/FabMenu'

const ICON_SIZE = 18
const POST_ICON_SIZE = 22

export default function TabsLayout() {
  const router       = useRouter()
  const { theme }    = useUnistyles()
  const insets       = useSafeAreaInsets()
  const unread       = useChatStore((s) => s.unread)
  const failedSyncs  = usePendingSyncStore((s) => s.failed.length)
  const [fabOpen, setFabOpen] = useState(false)
  const fabRotate    = useRef(new Animated.Value(0)).current

  useInboxRealtime()
  useNotificationsRealtime()

  function toggleFab() {
    const toValue = fabOpen ? 0 : 1
    setFabOpen(!fabOpen)
    Animated.spring(fabRotate, { toValue, useNativeDriver: true, damping: 14, stiffness: 200 }).start()
  }

  const fabSpin = fabRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] })

  // Use initialWindowMetrics as a stable fallback, on Android, screen wake briefly
  // reports insets as 0 before system bars finish rendering, causing a layout jump.
  const stableBottom = insets.bottom > 0 ? insets.bottom : (initialWindowMetrics?.insets.bottom ?? 0)
  const tabBarHeight = 72 + stableBottom

  const fabActions = [
    {
      icon:    <ClipboardList size={20} color={theme.colors.brand.primary} />,
      label:   'Post a Gig',
      onPress: () => router.navigate('/(tabs)/create-gig' as never),
    },
    {
      icon:    <Coins size={20} color={theme.colors.brand.primary} />,
      label:   'Sell / Cash out',
      onPress: () => router.navigate('/wallet/buy-sell' as never),
    },
  ]

  return (
    <>
      <Tabs
        backBehavior="history"
        screenOptions={() => ({
          headerShown: false,
          tabBarActiveTintColor: theme.colors.brand.primary,
          tabBarInactiveTintColor: theme.colors.content.tertiary,
          tabBarLabelStyle: {
            fontFamily: typography.fonts.body.semibold,
            fontSize: 10,
            lineHeight: 14,
            marginTop: 3,
          },
          tabBarItemStyle: {
            paddingVertical: 0,
          },
          tabBarBadgeStyle: {
            backgroundColor: theme.colors.brand.primary,
            color: theme.colors.brand.onPrimary,
            fontFamily: typography.fonts.body.bold,
            fontSize: 9.5,
            lineHeight: 12,
            minWidth: 14,
            height: 14,
            borderRadius: 7,
            paddingHorizontal: 4,
            borderWidth: 2,
            borderColor: theme.colors.surface.background,
          },
          tabBarStyle: {
            backgroundColor: theme.colors.surface.background,
            borderTopColor: theme.colors.border.subtle,
            borderTopWidth: 1,
            height: tabBarHeight,
            paddingTop: 4,
            paddingBottom: stableBottom + 16,
            paddingHorizontal: 8,
            elevation: 0,
            shadowOpacity: 0,
          },
        })}
      >
        {/* ── Visible tabs ── */}
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <View style={[s.iconWrap, focused && s.iconWrapActive, focused && { backgroundColor: theme.colors.brand.primarySurface }]}>
                <Home color={color} size={ICON_SIZE} strokeWidth={focused ? 2.5 : 1.8} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="exchange"
          options={{
            title: 'Trade',
            tabBarIcon: ({ color, focused }) => (
              <View style={[s.iconWrap, focused && s.iconWrapActive, focused && { backgroundColor: theme.colors.brand.primarySurface }]}>
                <ArrowLeftRight color={color} size={ICON_SIZE} strokeWidth={focused ? 2.5 : 1.8} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="create-gig"
          listeners={{
            tabPress: (e) => {
              e.preventDefault()
              toggleFab()
            },
          }}
          options={{
            title: '',
            tabBarIcon: () => (
              <Animated.View
                style={[
                  s.postIcon,
                  { backgroundColor: theme.colors.brand.primary, transform: [{ rotate: fabSpin }] },
                ]}
              >
                <Plus color={theme.colors.brand.onPrimary} size={POST_ICON_SIZE} strokeWidth={2.8} />
              </Animated.View>
            ),
          }}
        />
        <Tabs.Screen
          name="wallet"
          options={{
            title: 'Wallet',
            tabBarBadge: failedSyncs > 0 ? (failedSyncs > 9 ? '9+' : failedSyncs) : undefined,
            tabBarIcon: ({ color, focused }) => (
              <View style={[s.iconWrap, focused && s.iconWrapActive, focused && { backgroundColor: theme.colors.brand.primarySurface }]}>
                <Wallet color={color} size={ICON_SIZE} strokeWidth={focused ? 2.5 : 1.8} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: 'Messages',
            tabBarBadge: unread > 0 ? (unread > 9 ? '9+' : unread) : undefined,
            tabBarIcon: ({ color, focused }) => (
              <View style={[s.iconWrap, focused && s.iconWrapActive, focused && { backgroundColor: theme.colors.brand.primarySurface }]}>
                <MessageCircle color={color} size={ICON_SIZE} strokeWidth={focused ? 2.5 : 1.8} />
              </View>
            ),
          }}
        />

        {/* ── Hidden screens (navigable, no tab) ── */}
        <Tabs.Screen name="my-gigs" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="update-profile" options={{ href: null }} />
      </Tabs>

      <FabMenu
        visible={fabOpen}
        onClose={() => {
          setFabOpen(false)
          Animated.spring(fabRotate, { toValue: 0, useNativeDriver: true, damping: 14, stiffness: 200 }).start()
        }}
        actions={fabActions}
        bottomInset={tabBarHeight}
      />
    </>
  )
}

const s = StyleSheet.create({
  iconWrap: {
    width: 48,
    height: 32,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    height: 32,
  },
  postIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.fab,
  },
})
