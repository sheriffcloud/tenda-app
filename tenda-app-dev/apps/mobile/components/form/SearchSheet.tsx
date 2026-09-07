import { useState } from 'react'
import {
  View,
  FlatList,
  Pressable,
  TextInput,
  StyleSheet,
  type ListRenderItemInfo,
} from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Search, Check } from 'lucide-react-native'
import { radius, spacing, typography } from '@/theme/tokens'
import { MAXIMUM_FONT_SIZE_MULTIPLIER } from '@/theme/accessibility'
import { Text } from '@/components/ui/Text'
import { BottomSheet } from '@/components/ui/BottomSheet'

export interface SearchSheetItem {
  key: string
  label: string
  sublabel?: string   // displayed dimly to the right of label (e.g. flag, city count)
}

interface SearchSheetProps {
  visible: boolean
  onClose: () => void
  title: string
  items: SearchSheetItem[]
  value: string | null
  onSelect: (key: string) => void
  searchPlaceholder?: string
  /** Extra element rendered to the right of the title (e.g. GPS button). */
  headerRight?: React.ReactNode
}

export function SearchSheet({
  visible,
  onClose,
  title,
  items,
  value,
  onSelect,
  searchPlaceholder = 'Search…',
  headerRight,
}: SearchSheetProps) {
  const { theme } = useUnistyles()
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    : items

  function handleSelect(key: string) {
    onSelect(key)
    setQuery('')
    onClose()
  }

  function handleClose() {
    setQuery('')
    onClose()
  }

  function renderItem({ item }: ListRenderItemInfo<SearchSheetItem>) {
    const selected = item.key === value
    return (
      <Pressable
        onPress={() => handleSelect(item.key)}
        style={({ pressed }) => [
          s.option,
          {
            backgroundColor: pressed
              ? theme.colors.surface.pressed
              : selected
                ? theme.colors.brand.primarySurface
                : 'transparent',
          },
        ]}
      >
        <View style={s.optionLeft}>
          <Text
            variant="body"
            weight={selected ? 'semibold' : 'regular'}
            color={selected ? theme.colors.brand.primary : theme.colors.content.primary}
          >
            {item.label}
          </Text>
          {item.sublabel ? (
            <Text size={13} color={theme.colors.content.tertiary} style={s.sublabel}>
              {item.sublabel}
            </Text>
          ) : null}
        </View>
        {selected && <Check size={16} color={theme.colors.brand.primary} />}
      </Pressable>
    )
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={title}
      headerRight={headerRight}
      scrollable={false}
    >
      <View style={[s.searchRow, { backgroundColor: theme.colors.control.inputBackground }]}>
        <Search size={16} color={theme.colors.content.tertiary} />
        <TextInput
          maxFontSizeMultiplier={MAXIMUM_FONT_SIZE_MULTIPLIER}
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          placeholderTextColor={theme.colors.content.tertiary}
          style={[s.searchInput, { color: theme.colors.content.primary }]}
          autoFocus
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        style={s.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={s.empty}>
            <Text variant="body" color={theme.colors.content.tertiary}>
              No results for &quot;{query}&quot;
            </Text>
          </View>
        }
      />
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: typography.styles.body.fontSize,
    paddingVertical: 0,
  },
  list: { flexGrow: 0 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  optionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sublabel: { marginLeft: 2 },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
})
