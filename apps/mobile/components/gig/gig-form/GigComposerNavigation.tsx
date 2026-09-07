import { StyleSheet, View } from 'react-native'
import { spacing } from '@/theme/tokens'
import { Button } from '@/components/ui/Button'
import { FormSubmitBar } from '@/components/form/FormSubmitBar'

interface Props {
  firstStep: boolean
  finalStep: boolean
  missingRequirement: string | null
  submitLabel: string
  loading: boolean
  onBack: () => void
  onContinue: () => void
}

export function GigComposerNavigation({
  firstStep,
  finalStep,
  missingRequirement,
  submitLabel,
  loading,
  onBack,
  onContinue,
}: Props) {
  const hint = missingRequirement !== null
    ? `${missingRequirement} to ${finalStep ? 'post your gig' : 'continue'}`
    : null

  return (
    <FormSubmitBar hint={hint}>
      <View style={s.actions}>
        {!firstStep ? (
          <Button variant="outline" size="lg" style={s.back} disabled={loading} onPress={onBack}>
            Back
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="lg"
          style={s.continue}
          disabled={missingRequirement !== null}
          loading={loading}
          onPress={onContinue}
        >
          {finalStep ? submitLabel : 'Continue'}
        </Button>
      </View>
    </FormSubmitBar>
  )
}

const s = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  back: { flex: 0.38 },
  continue: { flex: 1 },
})
