import { useCallback, useState } from 'react'
import { View, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { useFocusEffect } from 'expo-router'
import { Bell, Trash2, Plus } from 'lucide-react-native'
import { Text, showToast } from '@/components/ui'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { ErrorState } from '@/components/feedback'
import { SettingsGroup } from './SettingsRow'
import { AddSubscriptionSheet } from './AddSubscriptionSheet'
import { ALL_CITIES_KEY, subscriptionBody } from '@/lib/subscriptionCities'
import { useNotificationPermission } from '@/hooks/useNotificationPermission'
import { api } from '@/api/client'
import type { GigSubscription } from '@tenda/shared'

function formatSubLabel(sub: GigSubscription): string {
  const parts: string[] = []
  parts.push(sub.city === '*' ? 'All cities' : sub.city)
  if (sub.category && sub.category !== '*') parts.push(sub.category)
  return parts.join(' · ')
}

/**
 * Notifications section, new-gig subscriptions. Owns its own data fetch +
 * notification-permission state; the banner steers a denied user to iOS
 * Settings and disables the add row until permission is restored.
 */
export function SubscriptionsSection() {
  const { theme } = useUnistyles()
  const [subscriptions, setSubscriptions] = useState<GigSubscription[]>([])
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [subsError, setSubsError] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const { permission, ask } = useNotificationPermission()

  // Permission can only change from outside the app, which the hook picks up on
  // foreground, so this only has to wait for the first read to land.
  const notifDenied = permission !== null && !permission.enabled

  const loadSubscriptions = useCallback(() => {
    setLoadingSubs(true)
    setSubsError(false)
    api.subscriptions
      .list()
      .then(setSubscriptions)
      .catch(() => setSubsError(true))
      .finally(() => setLoadingSubs(false))
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadSubscriptions()
    }, [loadSubscriptions]),
  )

  async function handlePick(city: string) {
    try {
      const sub = await api.subscriptions.upsert(subscriptionBody(city))
      setSubscriptions((prev) => (prev.find((s2) => s2.id === sub.id) ? prev : [sub, ...prev]))
      showToast(
        'success',
        city === ALL_CITIES_KEY ? 'Subscribed to all new gigs' : `Subscribed to new gigs in ${city}`,
      )
    } catch {
      showToast('error', 'Failed to subscribe')
    }
  }

  async function removeSubscription(id: string) {
    try {
      await api.subscriptions.remove({ id })
      setSubscriptions((prev) => prev.filter((s2) => s2.id !== id))
    } catch {
      showToast('error', 'Failed to remove subscription')
    }
  }

  return (
    <>
      <SectionLabel>Notifications</SectionLabel>
      {notifDenied && (
        <Pressable
          onPress={() => {
            void ask()
          }}
          style={({ pressed }) => [
            s.banner,
            { backgroundColor: theme.colors.feedback.warning.surface },
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={[s.bannerDot, { backgroundColor: theme.colors.feedback.warning.base }]} />
          <Text style={[s.bannerText, { color: theme.colors.content.primary }]}>
            <Text style={{ fontWeight: '600' }}>Notifications are off.</Text> Turn them on to get alerts.
          </Text>
          <Text style={[s.bannerAction, { color: theme.colors.brand.primary }]}>Enable</Text>
        </Pressable>
      )}
      <SettingsGroup>
        {loadingSubs ? (
          <View style={s.loadingRow}>
            <ActivityIndicator size="small" color={theme.colors.brand.primary} />
          </View>
        ) : subsError ? (
          <ErrorState
            title="Couldn't load subscriptions"
            description="Tap to try again."
            ctaLabel="Retry"
            onCtaPress={loadSubscriptions}
            style={{ flex: 0, paddingVertical: 24 }}
          />
        ) : (
          <>
            {subscriptions.map((sub, index) => (
              <View key={sub.id}>
                {index > 0 && <View style={[s.rowDivider, { backgroundColor: theme.colors.border.subtle }]} />}
                <View style={s.subRow}>
                  <View style={[s.subIc, { backgroundColor: theme.colors.brand.primarySurface }]}>
                    <Bell size={15} color={theme.colors.brand.primary} />
                  </View>
                  <View style={s.subBody}>
                    <Text style={[s.subFilters, { color: theme.colors.content.primary }]} numberOfLines={1}>
                      {formatSubLabel(sub)}
                    </Text>
                    <Text style={[s.subHint, { color: theme.colors.content.secondary }]} numberOfLines={1}>
                      Notify me on new matches
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => removeSubscription(sub.id)}
                    style={({ pressed }) => [s.subTrash, pressed && { opacity: 0.6 }]}
                    hitSlop={8}
                    accessibilityLabel="Remove subscription"
                  >
                    <Trash2 size={15} color={theme.colors.content.tertiary} />
                  </Pressable>
                </View>
              </View>
            ))}
            {subscriptions.length > 0 && (
              <View style={[s.rowDivider, { backgroundColor: theme.colors.border.subtle }]} />
            )}
            <Pressable
              onPress={() => setSheetOpen(true)}
              disabled={notifDenied}
              style={({ pressed }) => [
                s.addRow,
                notifDenied && { opacity: 0.55 },
                pressed && !notifDenied && { backgroundColor: theme.colors.surface.pressed },
              ]}
            >
              <View
                style={[
                  s.addPlus,
                  notifDenied
                    ? { backgroundColor: theme.colors.surface.inset }
                    : { backgroundColor: theme.colors.brand.primarySurface },
                ]}
              >
                <Plus
                  size={18}
                  color={notifDenied ? theme.colors.content.tertiary : theme.colors.brand.primary}
                  strokeWidth={2}
                />
              </View>
              <Text
                style={[s.addText, { color: notifDenied ? theme.colors.content.tertiary : theme.colors.brand.primary }]}
              >
                Subscribe to new gigs
              </Text>
            </Pressable>
          </>
        )}
      </SettingsGroup>
      {notifDenied && (
        <Text style={[s.notifHint, { color: theme.colors.content.tertiary }]}>
          Turn on notifications to add subscriptions.
        </Text>
      )}

      <AddSubscriptionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={handlePick}
      />
    </>
  )
}

const s = StyleSheet.create({
  loadingRow: {
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowDivider: { height: 1, marginLeft: 72 },
  banner: {
    marginHorizontal: 20,
    marginBottom: 8,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 17 },
  bannerAction: { fontSize: 13.5, fontWeight: '600', paddingHorizontal: 4, paddingVertical: 8, flexShrink: 0 },
  subRow: {
    minHeight: 72,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subIc: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  subBody: { flex: 1, minWidth: 0 },
  subFilters: { fontSize: 14, letterSpacing: -0.14 },
  subHint: { fontSize: 12.5, marginTop: 2, letterSpacing: -0.063 },
  subTrash: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addRow: { height: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  addPlus: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 15, fontWeight: '600' },
  notifHint: { paddingHorizontal: 20, paddingTop: 10, fontSize: 12.5, lineHeight: 17 },
})
