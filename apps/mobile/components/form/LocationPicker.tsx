import { useState, useEffect } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { MapPin, ChevronRight, LocateFixed } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { SearchSheet, type SearchSheetItem } from './SearchSheet'
import { useLocationDetect } from '@/hooks/useLocationDetect'
import { LOCATIONS, type CountryCode } from '@tenda/shared'

interface LocationPickerProps {
  country: string | null
  city: string | null
  onChange: (country: string, city: string | null) => void
  label?: string
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
 * Picker row per `create-gig.html .picker-row`:
 *   64h R14 --inset, grid 24/1fr/16, gap 12. Leading MapPin 16 in --ink-2,
 *   body has mono 9.5/600 +0.10em uppercase eyebrow + 14.5 value (placeholder = --ink-3).
 *   Trailing chevron 14 --ink-3.
 */
export function LocationPicker({ country, city, onChange, label = 'Location' }: LocationPickerProps) {
  const { theme } = useUnistyles()
  const [countryOpen, setCountryOpen] = useState(false)
  const [cityOpen, setCityOpen]       = useState(false)

  const [pendingCountry, setPendingCountry] = useState<string | null>(country)
  useEffect(() => { setPendingCountry(country) }, [country])

  const { detect, detecting, error, clearError } = useLocationDetect({
    onDetected: (detectedCountry, detectedCity) => {
      setCityOpen(false)
      onChange(detectedCountry, detectedCity)
    },
  })

  function handleCountrySelect(code: string) {
    setPendingCountry(code)
    setCountryOpen(false)
    if (code !== country) onChange(code, null)
    setCityOpen(true)
  }

  function handleCitySelect(selectedCity: string) {
    setCityOpen(false)
    onChange(pendingCountry!, selectedCity)
  }

  function handleCityClose() {
    setCityOpen(false)
    clearError()
  }

  const countryEntry = country ? LOCATIONS[country as CountryCode] : null
  const valueText = countryEntry
    ? city
      ? `${countryEntry.flag} ${countryEntry.name} · ${city}`
      : `${countryEntry.flag} ${countryEntry.name}`
    : 'Select location'

  const isPlaceholder = !country

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
      <Pressable
        onPress={() => setCountryOpen(true)}
        style={({ pressed }) => [
          s.row,
          { backgroundColor: theme.colors.surface.inset },
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <MapPin size={16} color={theme.colors.content.secondary} />
        <View style={s.body}>
          <Text style={[s.eyebrow, { color: theme.colors.content.tertiary }]}>
            {label.toUpperCase()}
          </Text>
          <Text
            style={[
              s.value,
              { color: isPlaceholder ? theme.colors.content.tertiary : theme.colors.content.primary },
            ]}
            numberOfLines={1}
          >
            {valueText}
          </Text>
        </View>
        <ChevronRight size={14} color={theme.colors.content.tertiary} />
      </Pressable>

      {error ? (
        <Text size={12} color={theme.colors.feedback.warning.base} style={s.error}>
          {error}
        </Text>
      ) : null}

      <SearchSheet
        visible={countryOpen}
        onClose={() => setCountryOpen(false)}
        title="Select Country"
        items={COUNTRY_ITEMS}
        value={country}
        onSelect={handleCountrySelect}
        searchPlaceholder="Search country…"
      />

      <SearchSheet
        visible={cityOpen}
        onClose={handleCityClose}
        title={`Select City${pendingCountry ? ` in ${LOCATIONS[pendingCountry as CountryCode]?.name ?? ''}` : ''}`}
        items={pendingCountry ? cityItems(pendingCountry) : []}
        value={city}
        onSelect={handleCitySelect}
        searchPlaceholder="Search city…"
        headerRight={gpsButton}
      />
    </>
  )
}

const s = StyleSheet.create({
  row: {
    marginHorizontal: 20,
    height: 64,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontFamily: typography.fonts.mono,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.95,
    marginBottom: 2,
    includeFontPadding: false,
  },
  value: {
    fontSize: 14.5,
    lineHeight: 18,
    letterSpacing: -0.07,
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
