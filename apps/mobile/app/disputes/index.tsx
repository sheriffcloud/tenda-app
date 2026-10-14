/**
 * "My Disputes" — the caller's party-facing dispute list, so a dispute stays
 * findable after its push notification is dismissed. Open|Resolved segments;
 * rows deep-link into the mediation thread (/dispute/:escrowId).
 */
import { useState } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useUnistyles } from 'react-native-unistyles'
import { Scale } from 'lucide-react-native'
import type { MyDisputeRow as MyDisputeRowType, MyDisputeStatus } from '@tenda/shared'
import { ScreenContainer, Text, EmptyState, Header, PaginatedList } from '@/components/ui'
import { ErrorState } from '@/components/feedback'
import { MyDisputeRow } from '@/components/dispute/MyDisputeRow'
import { useMyDisputes } from '@/hooks/useMyDisputes'
import { spacing } from '@/theme/tokens'

const SEGMENTS: { key: MyDisputeStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
]

const EMPTY_COPY: Record<MyDisputeStatus, { title: string; description: string }> = {
  open: { title: 'No open disputes', description: 'Disputes you raise or that are raised against you appear here.' },
  resolved: { title: 'No resolved disputes', description: 'Once a dispute is settled it moves here for your records.' },
}

export default function MyDisputesScreen() {
  const { theme } = useUnistyles()
  const router = useRouter()
  const [status, setStatus] = useState<MyDisputeStatus>('open')

  const list = useMyDisputes(status)

  function openThread(escrowId: string) {
    router.push(`/dispute/${escrowId}` as Parameters<typeof router.push>[0])
  }

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right']}>
      <Header title="My disputes" showBack />

      <View style={[s.segments, { borderBottomColor: theme.colors.border.subtle }]}>
        {SEGMENTS.map((seg) => {
          const active = status === seg.key
          return (
            <Pressable
              key={seg.key}
              onPress={() => setStatus(seg.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={s.segment}
            >
              <Text
                style={[
                  s.segmentLabel,
                  { color: active ? theme.colors.content.primary : theme.colors.content.tertiary },
                ]}
              >
                {seg.label}
              </Text>
              {active && <View style={[s.underline, { backgroundColor: theme.colors.brand.solid }]} />}
            </Pressable>
          )
        })}
      </View>

      <PaginatedList<MyDisputeRowType>
        list={list}
        keyOf={(item) => item.dispute_id}
        renderItem={({ item }) => <MyDisputeRow row={item} onPress={() => openThread(item.escrow_id)} />}
        contentContainerStyle={s.list}
        separatorHeight={spacing.sm}
        onRefresh={() => void list.refresh()}
        errorState={
          <ErrorState
            title={list.error ?? 'Could not load your disputes'}
            ctaLabel="Try again"
            onCtaPress={() => void list.refresh()}
          />
        }
        empty={
          <View style={s.empty}>
            <EmptyState
              icon={<Scale size={40} color={theme.colors.content.secondary} />}
              title={EMPTY_COPY[status].title}
              description={EMPTY_COPY[status].description}
            />
          </View>
        }
      />
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  segments: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    height: 48,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: {
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.145,
  },
  underline: {
    position: 'absolute',
    bottom: -1,
    height: 3,
    left: 0,
    right: 0,
    marginHorizontal: '25%',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  empty: {
    paddingTop: spacing['2xl'],
  },
})
