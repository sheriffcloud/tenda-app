/**
 * Underline tab row for a horizontally-paged screen (My Gigs, Trade). Both
 * screens had hand-rolled the same animated underline with slightly different
 * interpolation maths; this owns it once.
 *
 * The underline is driven by the pager's own scroll offset rather than the
 * selected index, so it tracks a drag continuously instead of jumping at the
 * end of a swipe.
 */
import { View, Pressable, Animated, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Text } from '@/components/ui/Text'
import { typography } from '@/theme/tokens'

export interface PagerTab {
  key: string
  label: string
  /** Optional count chip — pass the SERVER total, not a loaded-rows length. */
  count?: number
}

interface PagerTabBarProps {
  tabs: readonly PagerTab[]
  activeIndex: number
  /** The pager's horizontal scroll offset. */
  scrollX: Animated.Value
  /** Page width — one full screen of horizontal scroll per tab. */
  pageWidth: number
  onTabPress: (index: number) => void
  /** Horizontal inset the underline starts from (matches the row padding). */
  insetX?: number
}

export function PagerTabBar({
  tabs,
  activeIndex,
  scrollX,
  pageWidth,
  onTabPress,
  insetX = 0,
}: PagerTabBarProps) {
  const { theme } = useUnistyles()
  const tabWidth = (pageWidth - insetX * 2) / tabs.length

  // Mapped across the FULL scroll range, not just the first page. Clamping at
  // one page width is invisible with two tabs but wrong with three: the
  // underline froze under tab 2 and never travelled to tab 3. `lastPage` is
  // floored at 1 so a single-tab bar can't produce a zero-width input range
  // (an invalid interpolation, not just a wrong one).
  const lastPage = Math.max(tabs.length - 1, 1)
  const underlineX = scrollX.interpolate({
    inputRange: [0, pageWidth * lastPage],
    outputRange: [0, tabWidth * lastPage],
    extrapolate: 'clamp',
  })

  return (
    <View
      style={[s.row, { borderBottomColor: theme.colors.border.subtle, paddingHorizontal: insetX }]}
      accessibilityRole="tablist"
    >
      {tabs.map((tab, i) => {
        const active = activeIndex === i
        return (
          <Pressable
            key={tab.key}
            style={s.tab}
            onPress={() => onTabPress(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text
              numberOfLines={1}
              style={[
                s.label,
                { color: active ? theme.colors.content.primary : theme.colors.content.tertiary },
              ]}
            >
              {tab.label}
            </Text>
            {tab.count !== undefined && (
              <View
                style={[
                  s.count,
                  {
                    backgroundColor: active
                      ? theme.colors.brand.primarySurface
                      : theme.colors.surface.inset,
                  },
                ]}
              >
                <Text
                  style={[
                    s.countText,
                    { color: active ? theme.colors.brand.primary : theme.colors.content.tertiary },
                  ]}
                >
                  {tab.count}
                </Text>
              </View>
            )}
          </Pressable>
        )
      })}
      <Animated.View
        testID="pager-underline"
        style={[
          s.underline,
          {
            width: tabWidth,
            left: insetX,
            backgroundColor: theme.colors.brand.solid,
            transform: [{ translateX: underlineX }],
          },
        ]}
      />
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    height: 48,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    // Shrinks ahead of the count chip: a clipped number is unreadable, a
    // truncated word still reads. Paired with `numberOfLines={1}` above — a
    // label with neither wraps into a second line that this row's fixed height
    // then clips, which is how four tabs used to fail on a narrow screen.
    flexShrink: 1,
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.145,
  },
  count: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: typography.fonts.mono.bold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.11,
  },
  underline: {
    position: 'absolute',
    bottom: -1,
    height: 3,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
})
