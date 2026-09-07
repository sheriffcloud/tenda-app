import { SearchSheet } from '@/components/form/SearchSheet'
import { subscriptionCityItems } from '@/lib/subscriptionCities'

interface AddSubscriptionSheetProps {
  visible: boolean
  onClose: () => void
  /** Picked city key — the '*' wildcard for "All cities", else a city name. */
  onPick: (city: string) => void
}

// LOCATIONS is a compile-time constant, so the option list is built once.
const CITY_ITEMS = subscriptionCityItems()

/** City chooser for a new-gig subscription — a searchable list over CITY_ITEMS. */
export function AddSubscriptionSheet({ visible, onClose, onPick }: AddSubscriptionSheetProps) {
  return (
    <SearchSheet
      visible={visible}
      onClose={onClose}
      title="Subscribe to a city"
      items={CITY_ITEMS}
      value={null}
      onSelect={onPick}
      searchPlaceholder="Search city…"
    />
  )
}
