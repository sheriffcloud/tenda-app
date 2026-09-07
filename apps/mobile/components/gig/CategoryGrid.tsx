import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Bike, Camera, ShoppingBag, Wrench, Laptop } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import type { GigCategory } from '@tenda/shared'

interface CategoryGridProps {
  selected: GigCategory | null
  onChange: (cat: GigCategory) => void
}

const ICONS: Record<GigCategory, LucideIcon> = {
  delivery: Bike,
  photo:    Camera,
  errand:   ShoppingBag,
  service:  Wrench,
  digital:  Laptop,
}

const LABELS: Record<GigCategory, string> = {
  delivery: 'Delivery',
  photo:    'Creative',
  errand:   'Errand',
  service:  'Service',
  digital:  'Digital',
}

const ORDER: GigCategory[] = ['delivery', 'photo', 'errand', 'service', 'digital']

/**
 * 2-column tinted-icon category tile picker per `create-gig.html .cat-grid`.
 * Tiles 64h R14 with 32×32 R16 category-tinted icon + label 14/600.
 * Selected: tile fills with category-surface and outline becomes category-text.
 */
export function CategoryGrid({ selected, onChange }: CategoryGridProps) {
  const { theme } = useUnistyles()

  return (
    <View style={s.grid}>
      {ORDER.map((key) => {
        const Icon = ICONS[key]
        const isSelected = selected === key
        const cat = theme.colors.category[key]

        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={({ pressed }) => [
              s.tile,
              {
                backgroundColor: isSelected ? cat.surface : theme.colors.surface.card,
                borderColor: isSelected ? cat.text : theme.colors.border.default,
              },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={LABELS[key]}
            accessibilityState={{ selected: isSelected }}
          >
            <View style={[s.iconTile, { backgroundColor: cat.surface }]}>
              <Icon size={15} color={cat.text} />
            </View>
            <Text
              style={[
                s.name,
                {
                  color: isSelected ? cat.text : theme.colors.content.primary,
                  fontWeight: isSelected ? '700' : '600',
                },
              ]}
              numberOfLines={1}
            >
              {LABELS[key]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  grid: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    height: 64,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  name: {
    fontFamily: typography.fonts.body.semibold,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: -0.07,
    flexShrink: 1,
  },
})
