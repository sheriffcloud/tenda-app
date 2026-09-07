import { useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { Globe2, MapPin, ChevronRight, LocateFixed } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { SearchSheet, type SearchSheetItem } from './SearchSheet'
import { useLocationDetect } from '@/hooks/useLocationDetect'
import { LOCATIONS, type CountryCode } from '@tenda/shared'

interface CountryCityPickerProps {
  country: string | null
  city: string | null
  onChange: (country: string, city: string | null) => void
}

const COUNTRY_ITEMS: SearchSheetItem[] = Object.entries(LOCATIONS).map(([code, entry]) => ({
  key: code,
  label: entry.name,
  sublabel: entry.flag,
}))

function cityItems(countryCode: string): SearchSheetItem[] {
  const entry = LOCATIONS[countryCode as CountryCode]
  if (!entry) return []
  return entry.cities.map((c) => ({ key: c, label: c }))
}

/**
 * Split-row variant of LocationPicker, renders Country and City as two stacked
 * picker rows sharing a parent card-split shell. Use inside a parent View with
 * `borderRadius` + `overflow: 'hidden'` to get the grouped-card look.
 *
 * For a single combined picker, use {@link LocationPicker}.
 */
export function CountryCityPicker({ country, city, onChange }: CountryCityPickerProps) {
  const { theme } = useUnistyles()
  const [countryOpen, setCountryOpen] = useState(false)
  const [cityOpen, setCityOpen] = useState(false)

  const { detect, detecting, error, clearError } = useLocationDetect({
    onDetected: (detectedCountry, detectedCity) => {
      setCityOpen(false)
      onChange(detectedCountry, detectedCity)
    },
  })

  function handleCountrySelect(code: string) {
    setCountryOpen(false)
    if (code !== country) {
      onChange(code, null)
      // Guide the user to finish the pair, prevents leaving country set
      // while city is still empty / orphaned from the old country.
      setTimeout(() => setCityOpen(true), 250)
    }
  }

  function handleCitySelect(selected: string) {
    setCityOpen(false)
    if (country) onChange(country, selected)
  }

  const countryEntry = country ? LOCATIONS[country as CountryCode] : null
  const countryValue = countryEntry ? `${countryEntry.flag} ${countryEntry.name}` : 'Select country'
  const cityValue = city ?? (country ? 'Select city' : 'Pick a country first')

  const cityDisabled = !country

  const gpsButton = (
    <Pressable
      onPress={detect}
      disabled={detecting}
      style={[s.gpsBtn, { backgroundColor: theme.colors.brand.primarySurface }]}
    >
      <LocateFixed size={14} color={theme.colors.brand.primary} />
      <Text size={12.5} weight="semibold" color={theme.colors.brand.primary}>
        {detecting ? 'Detecting…' : 'Use my location'}
      </Text>
    </Pressable>
  )

  return (
    <>
      <Row
        Icon={Globe2}
        eyebrow="Country"
        value={countryValue}
        placeholder={!country}
        onPress={() => setCountryOpen(true)}
      />
      <Divider />
      <Row
        Icon={MapPin}
        eyebrow="City"
        value={cityValue}
        placeholder={!city}
        disabled={cityDisabled}
        onPress={() => !cityDisabled && setCityOpen(true)}
      />

      {error ? (
        <Text size={12} color={theme.colors.feedback.warning.base} style={s.error}>
          {error}
        </Text>
      ) : null}

      <SearchSheet
        visible={countryOpen}
        onClose={() => setCountryOpen(false)}
        title="Select country"
        items={COUNTRY_ITEMS}
        value={country}
        onSelect={handleCountrySelect}
        searchPlaceholder="Search country…"
      />

      <SearchSheet
        visible={cityOpen}
        onClose={() => { setCityOpen(false); clearError() }}
        title={`Select city${countryEntry ? ` in ${countryEntry.name}` : ''}`}
        items={country ? cityItems(country) : []}
        value={city}
        onSelect={handleCitySelect}
        searchPlaceholder="Search city…"
        headerRight={gpsButton}
      />
    </>
  )
}

interface RowProps {
  Icon: typeof Globe2
  eyebrow: string
  value: string
  placeholder?: boolean
  disabled?: boolean
  onPress: () => void
}

function Row({ Icon, eyebrow, value, placeholder, disabled, onPress }: RowProps) {
  const { theme } = useUnistyles()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.row,
        disabled && { opacity: 0.5 },
        pressed && !disabled && { backgroundColor: theme.colors.surface.pressed },
      ]}
      accessibilityRole="button"
      accessibilityLabel={eyebrow}
    >
      <View style={[s.rowIc, { backgroundColor: theme.colors.surface.inset }]}>
        <Icon size={16} color={theme.colors.content.primary} />
      </View>
      <View style={s.rowBody}>
        <Text style={[s.eyebrow, { color: theme.colors.content.tertiary }]}>
          {eyebrow.toUpperCase()}
        </Text>
        <Text
          style={[
            s.value,
            { color: placeholder ? theme.colors.content.tertiary : theme.colors.content.primary },
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
      <ChevronRight size={16} color={theme.colors.content.tertiary} />
    </Pressable>
  )
}

function Divider() {
  const { theme } = useUnistyles()
  return <View style={[s.divider, { backgroundColor: theme.colors.border.subtle }]} />
}

const s = StyleSheet.create({
  row: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowIc: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontFamily: typography.fonts.mono,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.95,
    marginBottom: 1,
    includeFontPadding: false,
  },
  value: {
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.075,
  },
  divider: {
    height: 1,
    marginLeft: 68,
  },
  error: {
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 9999,
  },
})
