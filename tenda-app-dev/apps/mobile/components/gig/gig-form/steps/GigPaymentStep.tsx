import { StyleSheet, View } from 'react-native'
import { PaymentInput } from '@/components/form/PaymentInput'
import { DurationPicker } from '@/components/form/DurationPicker'
import { hasGigBudget } from '@tenda/shared'
import { FeeSummary } from '@/components/shared/FeeSummary'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { spacing } from '@/theme/tokens'
import type { ChainOption } from '../useGigForm'
import { AcceptDeadlinePicker } from '../AcceptDeadlinePicker'
import { AddFundsNudge } from '../AddFundsNudge'
import { NetworkPicker } from '../NetworkPicker'

interface Props {
  chainOptions: ChainOption[]
  chainId: string
  onChainChange: (chainId: string) => void
  asset: string
  assetSymbol: string
  /** Base-unit string; '' until a budget is set. */
  paymentRaw: string
  onPaymentChange: (raw: string) => void
  completionDuration: number
  onCompletionChange: (seconds: number) => void
  acceptDeadlineHours: number
  onAcceptDeadlineChange: (hours: number) => void
}

export function GigPaymentStep(props: Props) {
  return (
    <>
      <NetworkPicker
        options={props.chainOptions}
        selected={props.chainId}
        onSelect={props.onChainChange}
        assetSymbol={props.assetSymbol}
      />

      {/* First label of the step when NetworkPicker collapses (≤1 chain). */}
      <SectionLabel tight={props.chainOptions.length <= 1}>Budget</SectionLabel>
      <PaymentInput asset={props.asset} value={props.paymentRaw} onChange={props.onPaymentChange} />
      <AddFundsNudge chainId={props.chainId} asset={props.asset} paymentRaw={props.paymentRaw} />

      <SectionLabel>Delivery time</SectionLabel>
      <View style={s.padded}>
        <DurationPicker value={props.completionDuration} onChange={props.onCompletionChange} />
      </View>
      <AcceptDeadlinePicker value={props.acceptDeadlineHours} onChange={props.onAcceptDeadlineChange} />

      {hasGigBudget(props.paymentRaw) ? (
        <>
          <SectionLabel>Cost breakdown</SectionLabel>
          <View style={s.padded}>
            <FeeSummary asset={props.asset} principalRaw={props.paymentRaw} />
          </View>
        </>
      ) : null}
    </>
  )
}

const s = StyleSheet.create({ padded: { paddingHorizontal: spacing.lg } })
