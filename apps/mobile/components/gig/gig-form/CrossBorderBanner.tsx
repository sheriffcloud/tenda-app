import { View, StyleSheet } from 'react-native'
import { ExpandableNotice } from '@/components/ui/information'
import { isCrossBorder, LOCATIONS } from '@tenda/shared'
import type { CountryCode } from '@tenda/shared'

/**
 * Advisory banner shown when the gig's country differs from the poster's
 * home country, renders null when the posting isn't cross-border.
 */
export function CrossBorderBanner({
  remote,
  country,
  homeCountry,
  assetSymbol,
}: {
  remote: boolean
  country: string | null
  homeCountry: string | null
  assetSymbol: string
}) {
  if (!isCrossBorder(remote, country, homeCountry)) return null

  const locationName = LOCATIONS[country as CountryCode]?.name ?? country

  return (
    <View style={s.banner}>
      <ExpandableNotice
        content={{
          summary: 'This is a cross-border gig.',
          title: 'Cross-border posting',
          description: `Workers in ${locationName} receive ${assetSymbol} and can off-ramp through Tenda P2P.`,
          tone: 'info',
        }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  banner: {
    marginHorizontal: 20,
    marginTop: 10,
  },
})
