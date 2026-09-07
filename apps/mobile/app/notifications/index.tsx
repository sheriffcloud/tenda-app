/**
 * Notification centre — the in-app feed behind the bell. Pinned announcements
 * (broadcasts) above a cursor-paginated list of personal notices. Tapping a
 * notice marks it read and deep-links (notificationRoute); the header's
 * check-all action clears the badge. Realtime + the badge count live in
 * notifications.store; this screen only reads + drives it.
 */
import { useEffect, useState } from 'react'
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Bell, CheckCheck } from 'lucide-react-native'
import type { NotificationWire } from '@tenda/shared'
import { ScreenContainer, Header, Spacer, EmptyState } from '@/components/ui'
import { NotificationRow } from '@/components/notifications/NotificationRow'
import { AnnouncementCard } from '@/components/notifications/AnnouncementCard'
import { useNotificationsStore } from '@/stores/notifications.store'
import { notificationRoute } from '@/lib/notificationRoute'
import { spacing } from '@/theme/tokens'

export default function NotificationsScreen() {
  const router = useRouter()
  const { theme } = useUnistyles()

  const notifications = useNotificationsStore((s) => s.notifications)
  const announcements = useNotificationsStore((s) => s.announcements)
  const unread = useNotificationsStore((s) => s.unread)
  const loading = useNotificationsStore((s) => s.loading)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    void useNotificationsStore.getState().fetchFeed()
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await useNotificationsStore.getState().fetchFeed()
    setRefreshing(false)
  }

  function handlePress(n: NotificationWire) {
    void useNotificationsStore.getState().markRead(n.id)
    const route = notificationRoute(n.data)
    if (route !== null) router.push(route as Parameters<typeof router.push>[0])
  }

  const empty = !loading && notifications.length === 0 && announcements.length === 0

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right']}>
      <Header
        title="Notifications"
        showBack
        rightIcon={unread > 0 ? CheckCheck : undefined}
        onRightPress={() => void useNotificationsStore.getState().markAllRead()}
      />

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationRow notification={item} onPress={() => handlePress(item)} />
        )}
        ListHeaderComponent={
          announcements.length > 0 ? (
            <View style={s.announcements}>
              {announcements.map((a) => (
                <AnnouncementCard key={a.id} announcement={a} />
              ))}
            </View>
          ) : null
        }
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <Spacer size={spacing.xs} />}
        ListFooterComponent={<Spacer size={spacing.xl} />}
        onEndReached={() => void useNotificationsStore.getState().fetchMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || loading}
            onRefresh={handleRefresh}
            tintColor={theme.colors.brand.primary}
          />
        }
        ListEmptyComponent={
          empty ? (
            <View style={s.empty}>
              <EmptyState
                icon={<Bell size={40} color={theme.colors.content.secondary} />}
                title="No notifications yet"
                description="Updates about your gigs, exchanges, and account will show up here."
              />
            </View>
          ) : null
        }
      />
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  announcements: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  empty: {
    paddingTop: spacing['2xl'],
  },
})
