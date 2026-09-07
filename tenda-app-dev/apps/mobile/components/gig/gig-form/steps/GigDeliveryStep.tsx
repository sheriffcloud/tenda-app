import { StyleSheet, View } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { ProofParamsDraft, ProofType } from '@tenda/shared'
import { radius, spacing } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Spacer } from '@/components/ui/Spacer'
import { ReviewRow } from '@/components/shared/ReviewRow'
import { AcceptanceModePicker } from '../AcceptanceModePicker'
import { ProofRequirementPicker } from '../ProofRequirementPicker'
import { GeotagParamsEditor } from '../proof-params/GeotagParamsEditor'
import { StructuredFieldsEditor } from '../proof-params/StructuredFieldsEditor'

interface Props {
  requiresApproval: boolean
  onApprovalChange: (value: boolean) => void
  proofRequirements: ProofType[]
  onProofRequirementsChange: (value: ProofType[]) => void
  /** Gates the geotag chip — a remote gig has nowhere to check in. */
  remote: boolean
  proofDraft: ProofParamsDraft
  onProofDraftChange: (draft: ProofParamsDraft) => void
  title: string
  location: string
  budget: string
  timing: string
}

export function GigDeliveryStep(props: Props) {
  const { theme } = useUnistyles()

  return (
    <>
      <SectionLabel tight>Who can take it</SectionLabel>
      <AcceptanceModePicker requiresApproval={props.requiresApproval} onChange={props.onApprovalChange} />

      <SectionLabel>Proof of completion</SectionLabel>
      <ProofRequirementPicker
        value={props.proofRequirements}
        onChange={props.onProofRequirementsChange}
        remote={props.remote}
      />

      {/* The param editors appear only for the requirements that take params —
          the server refuses params for a type the gig does not require. */}
      {props.proofRequirements.includes('geotag') && !props.remote && (
        <>
          <Spacer size={spacing.sm} />
          <GeotagParamsEditor draft={props.proofDraft} onChange={props.onProofDraftChange} />
        </>
      )}
      {props.proofRequirements.includes('structured') && (
        <>
          <Spacer size={spacing.sm} />
          <StructuredFieldsEditor
            fields={props.proofDraft.fields}
            onChange={(fields) => props.onProofDraftChange({ ...props.proofDraft, fields })}
          />
        </>
      )}

      <SectionLabel>Review</SectionLabel>
      <View style={[s.review, { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default }]}>
        <Text variant="body" weight="bold" numberOfLines={2}>{props.title}</Text>
        <View style={[s.divider, { backgroundColor: theme.colors.border.subtle }]} />
        <ReviewRow label="Location" value={props.location} />
        <ReviewRow label="Budget" value={props.budget} emphasized />
        <ReviewRow label="Timing" value={props.timing} />
        <ReviewRow label="Acceptance" value={props.requiresApproval ? 'You approve an applicant' : 'First qualified worker'} />
      </View>
      <Text variant="caption" align="center" color={theme.colors.content.tertiary} style={s.note}>
        You can review the escrow terms once more before your wallet opens.
      </Text>
    </>
  )
}

const s = StyleSheet.create({
  review: { marginHorizontal: spacing.lg, borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  divider: { height: StyleSheet.hairlineWidth },
  note: { marginHorizontal: spacing['2xl'], marginTop: spacing.sm },
})
