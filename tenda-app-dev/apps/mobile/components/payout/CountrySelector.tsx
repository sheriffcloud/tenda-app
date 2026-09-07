import { View, StyleSheet } from 'react-native'
import { SUPPORTED_PAYOUT_COUNTRIES, PAYOUT_COUNTRY_SPECS } from '@tenda/shared'
import { Chip } from '@/components/ui/Chip'
import { SectionLabel } from '@/components/ui/SectionLabel'

/** Country picker for payouts, sourced from the shared payout-spec registry. */
export function CountrySelector({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (country: string) => void
}) {
  return (
    <View>
      <SectionLabel>Country</SectionLabel>
      <View style={s.chipRow}>
        {SUPPORTED_PAYOUT_COUNTRIES.map((code) => {
          const spec = PAYOUT_COUNTRY_SPECS[code]
          return (
            <Chip
              key={code}
              label={`${spec.flag} ${spec.countryName}`}
              variant="form"
              selected={selected === code}
              onPress={() => onSelect(code)}
            />
          )
        })}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 },
})
