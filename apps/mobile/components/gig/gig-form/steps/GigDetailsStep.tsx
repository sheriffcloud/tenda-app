import { StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { GigCategory } from '@tenda/shared'
import { CategoryGrid } from '@/components/gig/CategoryGrid'
import { CountryCityPicker } from '@/components/form/CountryCityPicker'
import { RemoteToggle } from '@/components/form/RemoteToggle'
import { Input } from '@/components/ui/Input'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { radius, spacing } from '@/theme/tokens'
import { CrossBorderBanner } from '../CrossBorderBanner'
import { DESC_MAX, TITLE_MAX } from '../constants'

interface Props {
  category: GigCategory | null
  onCategoryChange: (category: GigCategory) => void
  title: string
  onTitleChange: (value: string) => void
  description: string
  onDescriptionChange: (value: string) => void
  descriptionHint: string
  remote: boolean
  onRemoteChange: (value: boolean) => void
  country: string | null
  city: string | null
  onLocationChange: (country: string, city: string | null) => void
  homeCountry: string | null
  assetSymbol: string
}

export function GigDetailsStep(props: Props) {
  const { theme } = useUnistyles()

  return (
    <>
      <SectionLabel tight>Category</SectionLabel>
      <CategoryGrid selected={props.category} onChange={props.onCategoryChange} />

      <SectionLabel>Gig details</SectionLabel>
      <View style={s.fields}>
        <Input
          label="Title"
          placeholder="e.g. Deliver a package to Victoria Island"
          helper="Make it specific and easy to scan."
          value={props.title}
          onChangeText={props.onTitleChange}
          maxLength={TITLE_MAX}
          showCounter
        />
        <Input
          label="Description"
          placeholder="Describe the task, expectations, and deliverables…"
          helper={props.descriptionHint}
          value={props.description}
          onChangeText={props.onDescriptionChange}
          multiline
          maxLength={DESC_MAX}
          showCounter
        />
      </View>

      <SectionLabel>Where it happens</SectionLabel>
      <RemoteToggle value={props.remote} onChange={props.onRemoteChange} />
      {!props.remote ? (
        <View style={[s.location, {
          backgroundColor: theme.colors.surface.card,
          borderColor: theme.colors.border.default,
        }]}>
          <CountryCityPicker country={props.country} city={props.city} onChange={props.onLocationChange} />
        </View>
      ) : null}
      <CrossBorderBanner
        remote={props.remote}
        country={props.country}
        homeCountry={props.homeCountry}
        assetSymbol={props.assetSymbol}
      />
    </>
  )
}

const s = StyleSheet.create({
  fields: { paddingHorizontal: spacing.lg, gap: spacing.md },
  location: { marginTop: spacing.sm, marginHorizontal: spacing.lg, borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
})
