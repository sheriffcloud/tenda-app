/**
 * TxRow — the wallet feed's honesty contract. Settlement credits show the
 * chain-attested NET amount or nothing at all; the old gross-principal
 * fallback overstated every credit on chains whose events carried no amount.
 */
import { render, screen } from '@testing-library/react-native'
import {
  ESCROW_TX_TYPES,
  TX_FEED_VISIBILITY,
  type UserEscrowTransaction,
  type EscrowTxType,
} from '@tenda/shared'
// Pure data/derivation — no mocked deps, so it needs no deferred import.
import { TX_LABEL_BY_ROLE, txLabel } from '../tx-copy'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: {
      surface: { card: '#fff' }, border: { subtle: '#eee' },
      content: { primary: '#111', secondary: '#555', tertiary: '#999' },
      brand: { primary: '#0a0', primarySurface: '#efe' },
      accent: { primary: '#a0a', primarySurface: '#fef' },
      numeric: { positive: '#080', negative: '#800' },
    } },
  }),
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { TxRow } from '../TxRow'

const VIEWER = 'u1'

function tx(over: Partial<UserEscrowTransaction> & { type: EscrowTxType }): UserEscrowTransaction {
  return {
    id: 't1', escrow_id: 'e1', tx_ref: 'sig1', amount_raw: null, platform_fee_raw: null,
    creator_payout_raw: null, actor_id: null, created_at: '2026-07-17T10:00:00.000Z', winner: null,
    escrow: {
      id: 'e1', kind: 'exchange', title: null, amount_raw: '2000000', asset: 'USDC_SOL',
      chain_id: 'solana:devnet', status: 'completed', creator_id: 'seller-1', counterparty_id: VIEWER,
    },
    ...over,
  }
}

test('a credited settlement shows the NET event amount, not the 2 USDC principal', () => {
  render(<TxRow tx={tx({ type: 'approve', amount_raw: '1980000', platform_fee_raw: '20000' })} userId={VIEWER} />)
  expect(screen.getByText(/1\.98/)).toBeTruthy()
  expect(screen.queryByText(/^\+ 2$/)).toBeNull()
})

test('a settlement credit with NO attested amount shows no number (never the principal)', () => {
  render(<TxRow tx={tx({ type: 'approve', amount_raw: null })} userId={VIEWER} />)
  expect(screen.queryByText(/2/)).toBeNull()
  // The row itself still renders — worded from the viewer's (taker's) side.
  expect(screen.getByText('Crypto received')).toBeTruthy()
})

test('claim_stalled behaves like approve: attested net or nothing', () => {
  render(<TxRow tx={tx({ type: 'claim_stalled', amount_raw: null })} userId={VIEWER} />)
  expect(screen.queryByText(/2/)).toBeNull()
})

test('a refund row still falls back to the principal — a refund IS the full amount', () => {
  render(
    <TxRow
      tx={tx({ type: 'cancel', escrow: {
        id: 'e1', kind: 'exchange', title: null, amount_raw: '2000000', asset: 'USDC_SOL',
        chain_id: 'solana:devnet', status: 'cancelled', creator_id: VIEWER, counterparty_id: null,
      } })}
      userId={VIEWER}
    />,
  )
  expect(screen.getByText(/^\+/)).toBeTruthy()
  expect(screen.getByText(/2/)).toBeTruthy()
})

test('a split resolve shows each viewer THEIR OWN share, not the counterparty\'s', () => {
  const split = tx({
    type: 'resolve', winner: 'split',
    amount_raw: '1200000', creator_payout_raw: '800000', // uneven split for distinguishability
  })
  render(<TxRow tx={split} userId={VIEWER} />) // viewer = counterparty
  expect(screen.getByText(/1\.2/)).toBeTruthy()

  render(<TxRow tx={split} userId="seller-1" />) // viewer = creator
  expect(screen.getByText(/0\.8/)).toBeTruthy()
})

test('a creator-wins resolve credits the creator their attested share', () => {
  const won = tx({ type: 'resolve', winner: 'creator', amount_raw: '0', creator_payout_raw: '2000000' })
  render(<TxRow tx={won} userId="seller-1" />)
  expect(screen.getByText(/^\+/)).toBeTruthy()
  expect(screen.getByText(/2/)).toBeTruthy()
})

test('a counterparty-wins resolve credits the counterparty their net share', () => {
  const won = tx({ type: 'resolve', winner: 'counterparty', amount_raw: '1980000', creator_payout_raw: '0' })
  render(<TxRow tx={won} userId={VIEWER} />)
  expect(screen.getByText(/1\.98/)).toBeTruthy()
})

test('a resolve row with no attested payouts shows no number for either party', () => {
  const legacy = tx({ type: 'resolve', winner: 'counterparty' })
  render(<TxRow tx={legacy} userId={VIEWER} />)
  expect(screen.queryByText(/2/)).toBeNull()
})

test('funding shows the escrowed principal as a debit to the creator', () => {
  render(
    <TxRow
      tx={tx({ type: 'create', amount_raw: '2000000', escrow: {
        id: 'e1', kind: 'gig', title: 'Logo gig', amount_raw: '2000000', asset: 'USDC_SOL',
        chain_id: 'solana:devnet', status: 'open', creator_id: VIEWER, counterparty_id: null,
      } })}
      userId={VIEWER}
    />,
  )
  expect(screen.getByText(/^−|^-/)).toBeTruthy()
})

const CREATOR = 'seller-1'
const KINDS = ['gig', 'exchange'] as const

/**
 * The copy map and the server's visibility matrix have to move together. A
 * type visible to only ONE role can be worded once; a type both roles receive
 * needs a per-side decision, or one of them reads the other's action back at
 * them — exactly the bug this feed had.
 *
 * So: if a matrix cell ever flips and a NEW type becomes visible to both
 * sides, this fails and forces that copy decision. `resolve` is listed as
 * intentionally identical — "Dispute resolved" is true from either seat.
 */
describe('copy tracks the shared visibility matrix', () => {
  const bothVisible = ESCROW_TX_TYPES.filter(
    (t) =>
      TX_FEED_VISIBILITY[t].creator === 'always' &&
      TX_FEED_VISIBILITY[t].counterparty === 'always',
  )

  it('every type both parties see has been worded per side, or waived', () => {
    const WAIVED: EscrowTxType[] = ['resolve']
    for (const type of bothVisible) {
      if (WAIVED.includes(type)) continue
      for (const kind of KINDS) {
        expect(TX_LABEL_BY_ROLE[kind][type]).toBeDefined()
      }
    }
  })

  it('carries no override for a type only one side ever sees', () => {
    for (const kind of KINDS) {
      for (const type of Object.keys(TX_LABEL_BY_ROLE[kind]) as EscrowTxType[]) {
        expect(bothVisible).toContain(type)
      }
    }
  })

  it('a per-side override actually changes what each side reads', () => {
    for (const kind of KINDS) {
      for (const type of Object.keys(TX_LABEL_BY_ROLE[kind]) as EscrowTxType[]) {
        expect(txLabel(kind, type, 'creator')).not.toBe(txLabel(kind, type, 'counterparty'))
      }
    }
  })
})

/** The same row, re-pointed at a kind, rendered from one viewer's side. */
function rowOf(type: EscrowTxType, kind: (typeof KINDS)[number]) {
  const base = tx({ type })
  return tx({ type, escrow: { ...base.escrow, kind } })
}

describe('transaction labels', () => {
  // The base map is total, so this can only fail if someone reintroduces a
  // fallback — but a raw enum slug in a user's money history is bad enough to
  // pin. Widened to both VIEWERS as well as both kinds, because the per-role
  // override map is deliberately Partial: a role that falls through must land
  // on the total base map, never on the slug.
  it('never renders a raw enum slug, for either kind or either party', () => {
    for (const type of ESCROW_TX_TYPES) {
      for (const kind of KINDS) {
        for (const viewer of [VIEWER, CREATOR]) {
          const { unmount } = render(<TxRow tx={rowOf(type, kind)} userId={viewer} />)
          expect(screen.queryByText(type)).toBeNull()
          unmount()
        }
      }
    }
  })

  // The bug: the feed was worded per KIND only, so a poster's wallet read the
  // worker's actions back at them. Rows both parties receive must read from
  // the side that is looking.
  it('words a gig payout from each side', () => {
    render(<TxRow tx={rowOf('approve', 'gig')} userId={CREATOR} />)
    expect(screen.getByText('Payout released')).toBeTruthy()

    render(<TxRow tx={rowOf('approve', 'gig')} userId={VIEWER} />)
    expect(screen.getByText('Gig payout')).toBeTruthy()
  })

  it('words an exchange release from each side', () => {
    render(<TxRow tx={rowOf('approve', 'exchange')} userId={CREATOR} />)
    expect(screen.getByText('Crypto released')).toBeTruthy()

    render(<TxRow tx={rowOf('approve', 'exchange')} userId={VIEWER} />)
    expect(screen.getByText('Crypto received')).toBeTruthy()
  })

  it('words an assignment from each side, per kind', () => {
    render(<TxRow tx={rowOf('assign_accept', 'gig')} userId={CREATOR} />)
    expect(screen.getByText('Worker assigned')).toBeTruthy()

    render(<TxRow tx={rowOf('assign_accept', 'gig')} userId={VIEWER} />)
    expect(screen.getByText('Assigned to you')).toBeTruthy()

    render(<TxRow tx={rowOf('assign_accept', 'exchange')} userId={CREATOR} />)
    expect(screen.getByText('Buyer matched')).toBeTruthy()

    render(<TxRow tx={rowOf('assign_accept', 'exchange')} userId={VIEWER} />)
    expect(screen.getByText('Matched to you')).toBeTruthy()
  })

  // A released worker no longer matches either party column, so `role` is
  // null. The row must still word itself rather than blow up or fall through.
  it('falls back to base wording for a viewer who is no longer a party', () => {
    render(<TxRow tx={rowOf('approve', 'gig')} userId="stranger" />)
    expect(screen.getByText('Gig payout')).toBeTruthy()
  })

  it('carries no +/- sign for assign/unassign — neither moves value', () => {
    for (const type of ['assign_accept', 'unassign'] as const) {
      const { unmount } = render(<TxRow tx={tx({ type })} userId={VIEWER} />)
      expect(screen.queryByText(/^[+-]/)).toBeNull()
      unmount()
    }
  })
})

describe('signs are the viewer’s, not the escrow’s', () => {
  it('an approval is a credit to the worker and neutral to the poster', () => {
    const paid = { type: 'approve' as const, amount_raw: '1980000' }
    render(<TxRow tx={tx(paid)} userId={VIEWER} />)
    expect(screen.getByText(/^\+/)).toBeTruthy()

    render(<TxRow tx={tx(paid)} userId={CREATOR} />)
    // The poster's debit was recorded at funding; approving moves nothing to
    // them, so the row carries a figure but no direction.
    expect(screen.queryByText(/^[+−-]/)).toBeNull()
  })

  it('a claim credits the worker only', () => {
    const claimed = { type: 'claim_stalled' as const, amount_raw: '1980000' }
    render(<TxRow tx={tx(claimed)} userId={VIEWER} />)
    expect(screen.getByText(/^\+/)).toBeTruthy()

    render(<TxRow tx={tx(claimed)} userId={CREATOR} />)
    expect(screen.queryByText(/^\+/)).toBeNull()
  })

  // A resolve pays per side, so with no side there is no share to show — a
  // released worker must not inherit the counterparty's payout figure.
  it('a resolve shows no share to a viewer who is neither party', () => {
    const split = tx({
      type: 'resolve', winner: 'split', amount_raw: '1200000', creator_payout_raw: '800000',
    })
    render(<TxRow tx={split} userId="stranger" />)
    expect(screen.queryByText(/1\.2|0\.8/)).toBeNull()
    expect(screen.getByText('Dispute resolved')).toBeTruthy()
  })

  it('a losing side of a resolve gets no credit', () => {
    const won = tx({ type: 'resolve', winner: 'creator', amount_raw: '0', creator_payout_raw: '2000000' })
    render(<TxRow tx={won} userId={VIEWER} />) // counterparty lost
    expect(screen.queryByText(/^\+/)).toBeNull()
  })
})

// An asset the registry doesn't know yet (a chain added ahead of ASSET_META)
// still renders a unit rather than dropping the symbol.
test('an unregistered asset falls back to its raw id as the unit', () => {
  const exotic = tx({ type: 'create', amount_raw: '2000000' })
  render(<TxRow tx={{ ...exotic, escrow: { ...exotic.escrow, asset: 'WEIRD_TOKEN' } }} userId={VIEWER} />)
  expect(screen.getByText('WEIRD_TOKEN')).toBeTruthy()
})

// A dispute row's amount is the BOND, not the escrow principal. Both chains
// emit bond_amount, so the fallback was latent — but printing the whole gig
// value on "Dispute opened" is wrong by orders of magnitude.
test('a dispute with no attested bond shows no number, never the principal', () => {
  render(<TxRow tx={tx({ type: 'dispute', amount_raw: null })} userId={VIEWER} />)
  expect(screen.getByText('Dispute opened')).toBeTruthy()
  expect(screen.queryByText(/2/)).toBeNull()
})

test('a dispute WITH an attested bond shows the bond', () => {
  render(<TxRow tx={tx({ type: 'dispute', amount_raw: '100000' })} userId={VIEWER} />)
  expect(screen.getByText(/0\.1/)).toBeTruthy()
})
