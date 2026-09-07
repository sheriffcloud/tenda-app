import { SectionLabel } from '@/components/ui/SectionLabel'
import { PayoutAccountSelect } from '@/components/payout'
import type { PayoutAccountsState } from '@/hooks/usePayoutAccounts'

/** "Payout account" label + the shared dropdown, used by both sell tabs. */
export function SellPayoutSection({ payout }: { payout: PayoutAccountsState }) {
  return (
    <>
      <SectionLabel>Payout account</SectionLabel>
      <PayoutAccountSelect
        accounts={payout.accounts}
        selectedId={payout.selectedId}
        selected={payout.selected}
        onSelect={payout.setSelectedId}
        reload={payout.reload}
      />
    </>
  )
}
