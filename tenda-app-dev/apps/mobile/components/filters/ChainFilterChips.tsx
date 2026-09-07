/**
 * Settlement-chain filter, rendered as a horizontal chip row.
 *
 * Options come from the chain registry (`/v1/platform/chains`, cached in
 * `chain-registry.store`) — never a hardcoded list — so enabling a chain
 * stays a server config/seed change on both ends. The emitted value is the
 * CAIP-2 id the server's `chain_id` filter expects.
 */
import { ScrollView, StyleSheet } from 'react-native'
import { Chip } from '@/components/ui'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { spacing } from '@/theme/tokens'

interface ChainFilterChipsProps {
  /** Active CAIP-2 chain id, or null for "All chains". */
  value: string | null
  onChange: (chain_id: string | null) => void
  /**
   * Horizontal gutter — pass it when the row stands on its own as screen
   * furniture (the tabbed screens, where it sits outside the pager); omit it
   * inside a list header, whose content container already supplies one.
   *
   * Applied INSIDE the scroll content rather than as a wrapper padding, so the
   * chips still scroll edge to edge. Its presence also switches the row's
   * VERTICAL insets to standalone values: a gap above (nothing else separates
   * it from the tab bar) and none below, since the list underneath owns its own
   * top padding — and must keep owning it, because this whole row renders null
   * on a single-chain deployment.
   */
  gutterX?: number
}

export function ChainFilterChips({ value, onChange, gutterX }: ChainFilterChipsProps) {
  const chains = useChainRegistryStore((s) => s.chains)

  // Registry not loaded, or a single-chain deployment: a filter with one
  // option is noise, so render nothing rather than a dead control.
  // Exception: if a filter is ACTIVE, keep the row visible even when the
  // options collapse to one — a chain being disabled server-side while the
  // user has it selected would otherwise hide the only control that can
  // clear it, leaving them stuck on an invisible filter.
  if (chains === null || (chains.length < 2 && value === null)) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // MUST cancel ScrollView's own `baseHorizontal` flex (flexGrow: 1,
      // flexShrink: 1). Inside a list header that default is inert — the
      // content container is auto-height, so there is nothing to grow into.
      // As a direct child of a screen's flex column it makes this one-line row
      // split the leftover height with the list below it, pushing the list to
      // half-page. The row is content-height in both places.
      style={s.scroll}
      contentContainerStyle={[
        s.row,
        gutterX !== undefined && s.standalone,
        gutterX !== undefined && { paddingHorizontal: gutterX },
      ]}
    >
      <Chip label="All chains" selected={value === null} onPress={() => onChange(null)} />
      {chains.map((chain) => (
        <Chip
          key={chain.id}
          label={chain.display_name}
          selected={value === chain.id}
          // Single-select, and "All chains" is right there as the clear
          // affordance — so re-tapping the ACTIVE chip is a no-op, not a
          // reset. Toggle-to-clear made a second tap silently jump back to
          // all chains, which is exactly what someone does when they think
          // the first tap didn't register.
          onPress={() => onChange(chain.id)}
        />
      ))}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  /** Vertical insets for the standalone (screen-furniture) placement. */
  standalone: { paddingTop: spacing.sm, paddingBottom: 0 },
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
})
