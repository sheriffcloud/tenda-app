import {
  View,
  Pressable,
  StyleSheet,
} from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Search as SearchIcon } from 'lucide-react-native'
import { spacing } from '@/theme/tokens'
import { Text } from './Text'
import { Input } from './Input'
import { Chip } from './Chip'
import { BottomSheet } from './BottomSheet'
import { LocationPicker } from '@/components/form/LocationPicker'
import { CATEGORY_META } from '@tenda/shared'

interface FilterSheetProps {
  visible: boolean
  onClose: () => void
  query: string
  onQueryChange: (q: string) => void
  selectedCategory: string | null
  onCategoryChange: (cat: string | null) => void
  country: string | null
  city: string | null
  onLocationChange: (country: string, city: string | null) => void
  remote: boolean | null        // null = show all, true = remote only, false = local only
  onRemoteChange: (remote: boolean | null) => void
  crossBorder: boolean | null   // null = show all, true = cross-border only
  onCrossBorderChange: (v: boolean | null) => void
  onClearAll: () => void
}

export function FilterSheet({
  visible,
  onClose,
  query,
  onQueryChange,
  selectedCategory,
  onCategoryChange,
  country,
  city,
  onLocationChange,
  remote,
  onRemoteChange,
  crossBorder,
  onCrossBorderChange,
  onClearAll,
}: FilterSheetProps) {
  const { theme } = useUnistyles()
  const handleCategoryPress = (key: string) => {
    onCategoryChange(selectedCategory === key ? null : key)
  }

  const hasFilters = query.trim().length > 0 || selectedCategory !== null || country !== null || city !== null || remote !== null || crossBorder !== null

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Filter gigs"
    >
      <View style={s.section}>
        <Input
          placeholder="Search by title, city..."
          value={query}
          onChangeText={onQueryChange}
          icon={<SearchIcon size={18} color={theme.colors.content.tertiary} />}
          autoFocus={false}
        />
      </View>

      <View style={s.section}>
        <Text variant="caption" color={theme.colors.content.secondary} style={s.chipLabel}>
          Category
        </Text>
        <View style={s.chips}>
          {CATEGORY_META.map((category) => (
            <Chip
              key={category.key}
              label={category.label}
              selected={selectedCategory === category.key}
              category={category.key}
              onPress={() => handleCategoryPress(category.key)}
            />
          ))}
        </View>
      </View>

      <View style={s.section}>
        <Text variant="caption" color={theme.colors.content.secondary} style={s.chipLabel}>
          Gig type
        </Text>
        <View style={s.chips}>
          {([null, false, true] as const).map((value) => (
            <Chip
              key={String(value)}
              label={value === null ? 'All' : value ? 'Remote' : 'Local'}
              selected={remote === value && crossBorder === null}
              onPress={() => { onRemoteChange(value); onCrossBorderChange(null) }}
            />
          ))}
          <Chip
            label="Cross-border"
            selected={crossBorder === true}
            onPress={() => {
              onCrossBorderChange(crossBorder === true ? null : true)
              onRemoteChange(null)
            }}
          />
        </View>
      </View>

      <View style={s.section}>
        <LocationPicker
          country={country}
          city={city}
          onChange={onLocationChange}
          label="Location"
        />
      </View>

      {hasFilters && (
        <Pressable style={s.clearRow} onPress={onClearAll}>
          <Text variant="caption" color={theme.colors.content.tertiary}>
            Clear all filters
          </Text>
        </Pressable>
      )}
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  section: {
    paddingBottom: spacing.md,
  },
  chipLabel: {
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  clearRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
})
