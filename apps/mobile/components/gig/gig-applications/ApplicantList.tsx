/**
 * The poster's shortlist body: rows, filter, empty and error states.
 *
 * Presentational — loading and the assign transaction belong to the screen, so
 * this stays testable without a wallet or a router.
 */
import { View, StyleSheet, ScrollView } from 'react-native'
import type { GigApplicant } from '@tenda/shared'
import { Users } from 'lucide-react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing } from '@/theme/tokens'
import { EmptyState, ExpandableNotice, SegmentedTabs, Text } from '@/components/ui'
import { GigListSkeleton } from '@/components/gig/GigListSkeleton'
import { ApplicantRow } from './ApplicantRow'
import { APPLICANTS_EMPTY, APPLICANT_REVIEW_INFORMATION } from '@tenda/shared'
import type { ApplicantFilter } from './useApplications'

interface Props {
  applicants: GigApplicant[] | null
  error: string | null
  filter: ApplicantFilter
  onFilterChange: (filter: ApplicantFilter) => void
  assignable: boolean
  busy: boolean
  onAssign: (applicant: GigApplicant) => void
}

const FILTER_TABS = [
  { key: 'open' as const, label: 'Waiting' },
  { key: 'all' as const, label: 'All' },
]

export function ApplicantList({
  applicants,
  error,
  filter,
  onFilterChange,
  assignable,
  busy,
  onAssign,
}: Props) {
  const { theme } = useUnistyles()

  return (
    <View style={s.flex}>
      <View style={s.tabs}>
        <SegmentedTabs
          tabs={FILTER_TABS}
          value={filter}
          // SegmentedTabs is key-agnostic (`string`), so the union is restored
          // here against the tab list rather than asserted.
          onChange={(key) => onFilterChange(key === 'all' ? 'all' : 'open')}
        />
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {applicants !== null && applicants.length > 0 && (
          <ExpandableNotice content={APPLICANT_REVIEW_INFORMATION} />
        )}
        {error !== null && (
          <Text variant="caption" color={theme.colors.feedback.danger.base} align="center">
            {error}
          </Text>
        )}
        {/*
          `null` means the first load has not settled. Without this the body is
          simply blank while it does — and a blank shortlist reads as "nobody
          applied", which is the one thing it must not say by accident. The gig
          skeleton is reused rather than a new one written: these rows are the
          same shape (avatar, two lines, trailing control).
        */}
        {applicants === null && error === null && (
          <GigListSkeleton variant="priceLeading" count={3} />
        )}
        {/*
          Keyed on the FILTER: an empty "Waiting" tab means none are still
          live, not that nobody applied — assigning settles the rest (D4) and
          the sweep expires the others, so a heavily-applied-to gig lands here
          routinely.
        */}
        {applicants !== null && applicants.length === 0 && error === null && (
          <View style={s.empty}>
            <EmptyState
              icon={<Users size={40} color={theme.colors.content.secondary} />}
              {...APPLICANTS_EMPTY[filter]}
            />
          </View>
        )}
        {applicants?.map((applicant) => (
          <ApplicantRow
            key={applicant.id}
            applicant={applicant}
            assignable={assignable}
            busy={busy}
            onAssign={onAssign}
          />
        ))}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  tabs: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  empty: { paddingTop: spacing['2xl'] },
})
