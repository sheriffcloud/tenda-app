import { useState } from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { ChevronRight, Info } from 'lucide-react-native'
import { useUnistyles } from 'react-native-unistyles'
import { spacing, radius } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { InformationSheet } from './InformationSheet'
import type { ExpandableNoticeContent } from './types'

const ICON_SIZE = 17

/** One-line, fully tappable explanation trigger with its detail sheet. */
export function ExpandableNotice({ content }: { content: ExpandableNoticeContent }) {
  const { theme } = useUnistyles()
  const [expanded, setExpanded] = useState(false)
  const palette = theme.colors.feedback[content.tone]

  return (
    <>
      <TouchableOpacity
        onPress={() => setExpanded(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${content.summary} More information`}
        accessibilityState={{ expanded }}
        style={[
          s.notice,
          { backgroundColor: palette.surface, borderColor: palette.base },
        ]}
      >
        <Info size={ICON_SIZE} color={palette.base} />
        <View style={s.summary}>
          <Text size={12.5} weight="semibold" color={palette.base} numberOfLines={1}>
            {content.summary}
          </Text>
        </View>
        <ChevronRight size={ICON_SIZE} color={palette.base} />
      </TouchableOpacity>

      {expanded && (
        <InformationSheet
          visible
          title={content.title}
          description={content.description}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  )
}

const s = StyleSheet.create({
  notice: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  summary: { flex: 1 },
})
