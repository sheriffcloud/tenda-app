/**
 * Where the money lands.
 *
 * The load-bearing distinctions: loading vs empty ("add a payout account"
 * shown to someone who has three is a lie with a button on it), and inline
 * add vs link-out (spec-correction #50 — the old settings link discarded the
 * typed amount and rate, and pointed at a route that did not exist).
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BankAccountSummary } from '@tenda/shared'
import { PayoutAccountAside } from '@/components/wallet/sell/PayoutAccountAside'
import { SELL_COPY } from '@/components/wallet/sell/copy'

const created = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ api: { fiat: { createBankAccount: created } } }))

const acct = (over: Partial<BankAccountSummary> = {}): BankAccountSummary => ({
  id: 'acc-1',
  country: 'NG',
  kind: 'bank',
  bank_code: '058',
  account_number_masked: '••••6789',
  account_name: 'Ada Okafor',
  is_default: true,
  verified: true,
  created_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

const state = (over: Partial<Parameters<typeof PayoutAccountAside>[0]['payout']> = {}) => ({
  accounts: [acct()],
  selectedId: 'acc-1',
  setSelectedId: vi.fn(),
  selected: acct(),
  reload: vi.fn(),
  ...over,
})

/** Drives the REAL PayoutAccountForm through the NG bank rail. */
function fillAndSubmitForm() {
  fireEvent.change(screen.getByPlaceholderText('058'), { target: { value: '058' } })
  fireEvent.change(screen.getByPlaceholderText('0123456789'), {
    target: { value: '0123456789' },
  })
  fireEvent.change(screen.getByPlaceholderText('ADAEZE OKOYE'), {
    target: { value: 'ADA OKAFOR' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add account' }))
}

describe('PayoutAccountAside', () => {
  it('shimmers while the list is still loading — never "add one"', () => {
    const { container } = render(
      <PayoutAccountAside payout={state({ accounts: null, selected: null, selectedId: null })} />,
    )
    expect(container.querySelector('.animate-shimmer')).not.toBeNull()
    expect(screen.queryByText(SELL_COPY.noPayout)).toBeNull()
  })

  it('an empty list renders the add form INLINE — no link out of the composer', () => {
    render(<PayoutAccountAside payout={state({ accounts: [], selected: null, selectedId: null })} />)
    expect(screen.getByText(SELL_COPY.noPayout)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add account' })).toBeInTheDocument()
    // The pre-#50 empty state was a link to a settings route that DID NOT
    // exist; nothing here may navigate away from the half-typed sell.
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('names the account, its rail and its masked number — never the full one', () => {
    const { container } = render(<PayoutAccountAside payout={state()} />)
    expect(screen.getByText('Ada Okafor')).toBeInTheDocument()
    expect(container.textContent).toContain('••••6789')
  })

  it('shows the currency each account settles in, derived from its country', () => {
    render(
      <PayoutAccountAside
        payout={state({
          accounts: [acct(), acct({ id: 'acc-2', country: 'KE', account_name: 'Wanjiru' })],
        })}
      />,
    )
    expect(screen.getByText('₦ NGN')).toBeInTheDocument()
    expect(screen.getByText('KSh KES')).toBeInTheDocument()
  })

  it('marks the selected account for assistive tech, not only with colour', () => {
    render(
      <PayoutAccountAside
        payout={state({ accounts: [acct(), acct({ id: 'acc-2', account_name: 'Second' })] })}
      />,
    )
    expect(screen.getByRole('button', { name: /Ada Okafor/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Second/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects on click', () => {
    const setSelectedId = vi.fn()
    render(
      <PayoutAccountAside
        payout={state({
          accounts: [acct(), acct({ id: 'acc-2', account_name: 'Second' })],
          setSelectedId,
        })}
      />,
    )
    screen.getByRole('button', { name: /Second/ }).click()
    expect(setSelectedId).toHaveBeenCalledWith('acc-2')
  })
})

describe('adding an account on the fly', () => {
  it('keeps the form behind a disclosure when accounts already exist', () => {
    render(<PayoutAccountAside payout={state()} />)
    const toggle = screen.getByRole('button', { name: SELL_COPY.addAccount })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Add account' })).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Add account' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: SELL_COPY.closeAddAccount }),
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('a created account is selected, the list reloads, and the form closes', async () => {
    created.mockResolvedValueOnce(acct({ id: 'acc-new', account_name: 'New Dest' }))
    const setSelectedId = vi.fn()
    const reload = vi.fn()
    render(<PayoutAccountAside payout={state({ setSelectedId, reload })} />)
    fireEvent.click(screen.getByRole('button', { name: SELL_COPY.addAccount }))
    fillAndSubmitForm()
    await waitFor(() => expect(setSelectedId).toHaveBeenCalledWith('acc-new'))
    expect(reload).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Add account' })).toBeNull()
  })

  it('a failed create keeps the form open with nothing selected', async () => {
    created.mockRejectedValueOnce(new Error('nope'))
    const setSelectedId = vi.fn()
    render(
      <PayoutAccountAside
        payout={state({ accounts: [], selected: null, selectedId: null, setSelectedId })}
      />,
    )
    fillAndSubmitForm()
    await waitFor(() => expect(created).toHaveBeenCalled())
    expect(setSelectedId).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Add account' })).toBeInTheDocument()
  })
})
