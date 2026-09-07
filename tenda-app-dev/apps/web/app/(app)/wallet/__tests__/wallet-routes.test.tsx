/**
 * The two new wallet routes' own decisions: which mode the sell surface opens
 * in, and the intent page's three answers — loading, gone, and an intent.
 *
 * The gone/loading split is the point. A spinner that never resolves and "this
 * transaction no longer exists" are different things to tell someone about
 * their money.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { FiatIntentDetail } from '@tenda/shared'
import SellPage from '@/app/(app)/wallet/buy-sell/page'
import FiatIntentPage from '@/app/(app)/wallet/intents/[id]/page'
import { INTENT_COPY } from '@/components/wallet/intent'

const search = vi.hoisted(() => ({ current: new URLSearchParams() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => search.current,
  useParams: () => ({ id: 'int-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/components/wallet/sell/SellSurface', () => ({
  SellSurface: ({ mode }: { mode: string }) => <p>{`mode:${mode}`}</p>,
}))

const intentState = vi.hoisted(() => ({
  current: {
    intent: null as FiatIntentDetail | null,
    gone: false,
    loading: false,
    cancelling: false,
    cancel: vi.fn(),
    reload: vi.fn(),
  },
}))
vi.mock('@/hooks/fiat/useFiatIntent', () => ({ useFiatIntent: () => intentState.current }))

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

describe('/wallet/buy-sell', () => {
  it('opens in the default mode', () => {
    search.current = new URLSearchParams()
    render(<SellPage />)
    expect(screen.getByText('mode:instant')).toBeInTheDocument()
  })

  it('deep-links the offer mode', () => {
    search.current = new URLSearchParams('mode=offer')
    render(<SellPage />)
    expect(screen.getByText('mode:offer')).toBeInTheDocument()
  })

  it('narrows a mode it does not have rather than passing it through', () => {
    // `?mode=buy` is the one a stale link would carry — Buy was retired in #61.
    search.current = new URLSearchParams('mode=buy')
    render(<SellPage />)
    expect(screen.getByText('mode:instant')).toBeInTheDocument()
  })
})

describe('/wallet/intents/[id]', () => {
  it('shows a spinner while the first load is in flight — not "gone"', () => {
    intentState.current = { ...intentState.current, intent: null, gone: false, loading: true }
    render(<FiatIntentPage />)
    expect(screen.queryByText(INTENT_COPY.goneTitle)).toBeNull()
    expect(screen.getByText(INTENT_COPY.loadingLabel)).toBeInTheDocument()
  })

  it('says an intent is GONE, and points back at the wallet', () => {
    intentState.current = { ...intentState.current, intent: null, gone: true, loading: false }
    render(<FiatIntentPage />)
    expect(screen.getByText(INTENT_COPY.goneTitle)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: INTENT_COPY.back })).toHaveAttribute('href', '/wallet')
  })

  it('offers a cancel only while the intent can still be cancelled', () => {
    intentState.current = { ...intentState.current, intent: detail({ status: 'quoted' }), gone: false, loading: false }
    const cancellable = render(<FiatIntentPage />)
    expect(screen.getByRole('button', { name: INTENT_COPY.cancel })).toBeInTheDocument()
    cancellable.unmount()

    intentState.current = { ...intentState.current, intent: detail({ status: 'settled' }) }
    render(<FiatIntentPage />)
    expect(screen.queryByRole('button', { name: INTENT_COPY.cancel })).toBeNull()
    expect(screen.getByRole('button', { name: INTENT_COPY.done })).toBeInTheDocument()
  })

})
