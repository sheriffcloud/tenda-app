/**
 * The intent page's three blocks.
 *
 * The tone derivation is the piece worth pinning: colouring "waiting for the
 * provider" as a failure would tell a reader their money is gone while it is
 * in flight, and `settled` is the only good ending among the terminal states.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { INTENT_STATUS_COPY, type FiatIntentDetail, type FiatIntentStatus } from '@tenda/shared'
import {
  INTENT_COPY,
  IntentRows,
  IntentStatusPanel,
  intentTone,
} from '@/components/wallet/intent'

const detail = (over: Partial<FiatIntentDetail> = {}): FiatIntentDetail =>
  ({
    id: 'int-1',
    direction: 'offramp',
    status: 'awaiting_provider',
    provider: 'rail-x',
    fiat_currency: 'NGN',
    fiat_amount: '75000.0000',
    asset: 'USDC_SOL',
    asset_amount_raw: '50000000',
    rate: '1500.0000000000',
    fee_amount: '250.0000',
    kyc_required: false,
    kyc_url: null,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    instruction: null,
    created_at: '2026-08-18T09:00:00.000Z',
    ...over,
  }) as FiatIntentDetail

describe('intentTone', () => {
  it('is three tones, not seven statuses', () => {
    expect(intentTone('settled')).toBe('settled')
    expect(intentTone('failed')).toBe('failed')
    expect(intentTone('cancelled')).toBe('failed')
  })

  it('never colours an in-flight intent as a failure', () => {
    for (const status of ['quoted', 'awaiting_user', 'awaiting_provider', 'settling'] as FiatIntentStatus[]) {
      expect(intentTone(status), status).toBe('pending')
    }
  })
})

describe('IntentStatusPanel', () => {
  it('names the phase from the SHARED table, so it cannot drift from mobile', () => {
    render(<IntentStatusPanel intent={detail()} />)
    expect(screen.getByText(INTENT_STATUS_COPY.awaiting_provider)).toBeInTheDocument()
  })

  it('headlines the amount in the intent’s OWN currency, never a hardcoded one', () => {
    // Mobile's screen prints "₦" whatever the intent settles in.
    render(<IntentStatusPanel intent={detail({ fiat_currency: 'KES', fiat_amount: '6450.0000' })} />)
    expect(screen.getByText('Ksh 6,450')).toBeInTheDocument()
  })

  it('prefers the provider’s own instruction while it still applies', () => {
    render(
      <IntentStatusPanel
        intent={detail({
          status: 'awaiting_user',
          instruction: { kind: 'ussd', code: '*737*1#' },
        })}
      />,
    )
    expect(screen.getByText(/\*737\*1#/)).toBeInTheDocument()
  })

  it('drops an instruction that no longer applies once the intent is terminal', () => {
    const { container } = render(
      <IntentStatusPanel
        intent={detail({ status: 'settled', instruction: { kind: 'ussd', code: '*737*1#' } })}
      />,
    )
    expect(container.textContent).not.toContain('*737*1#')
    expect(screen.getByText(INTENT_COPY.body('settled'))).toBeInTheDocument()
  })

  it('runs no clock on a terminal intent', () => {
    const { container } = render(<IntentStatusPanel intent={detail({ status: 'settled' })} />)
    expect(container.textContent).not.toMatch(/\d+:\d{2}:\d{2}/)
  })
})

describe('IntentRows', () => {
  it('keeps the RATE’s decimals while rounding the amounts beside it', () => {
    render(<IntentRows intent={detail({ fiat_currency: 'GHS', rate: '15.4900000000' })} />)
    expect(screen.getByText('GH₵15.49')).toBeInTheDocument()
  })

  it('carries the reference a support conversation needs', () => {
    render(<IntentRows intent={detail()} />)
    expect(screen.getByText('int-1')).toBeInTheDocument()
  })
})
