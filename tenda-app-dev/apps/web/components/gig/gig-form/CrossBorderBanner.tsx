'use client'

/**
 * Advisory banner shown when the gig's country differs from the poster's
 * home country — web twin of mobile's gig-form/CrossBorderBanner. Renders
 * null when the posting isn't cross-border.
 */
import { isCrossBorder, LOCATIONS } from '@tenda/shared'
import type { CountryCode } from '@tenda/shared'

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
    <p className="rounded-control border border-border-subtle bg-surface-card px-3.5 py-2.5 text-xs text-content-secondary">
      <span className="font-semibold text-content-primary">Cross-border posting. </span>
      Workers in {locationName} receive {assetSymbol} and can off-ramp through Tenda P2P.
    </p>
  )
}
