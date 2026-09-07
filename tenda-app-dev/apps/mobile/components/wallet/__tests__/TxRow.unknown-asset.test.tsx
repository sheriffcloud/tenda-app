/**
 * What the wallet feed shows for an asset this build has no metadata for.
 *
 * `ASSET_META` is the source the server's asset seed is built FROM, so an
 * unknown asset means this install predates the seed. Its decimals are unknown
 * and base units are wrong by 10^decimals — the row used to print 1,980,000
 * beside a symbol the reader had no way to sanity-check.
 *
 * Its own file rather than appended to `TxRow.test.tsx`, which is already at
 * the 300-line house limit.
 */
import { render, screen } from '@testing-library/react-native'
import { type UserEscrowTransaction, type EscrowTxType } from '@tenda/shared'

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

test('an asset this build has no metadata for keeps its id but shows no figure', () => {
  // `ASSET_META` is the source the server's asset seed is built from, so an
  // unknown asset means this install predates the seed. Its decimals are
  // unknown and base units are wrong by 10^decimals — the row used to print
  // 1,980,000 beside a symbol the reader had no way to sanity-check. The row
  // and the symbol survive; only the number is withheld.
  const base = tx({ type: 'approve', amount_raw: '1980000' })
  render(
    <TxRow
      tx={{ ...base, escrow: { ...base.escrow, asset: 'USDT_FUTURE' } }}
      userId={VIEWER}
    />,
  )

  expect(screen.getByText('USDT_FUTURE')).toBeTruthy()
  expect(screen.getByText(/—/)).toBeTruthy()
  expect(screen.queryByText(/1,980,000|1980000/)).toBeNull()
})

test('a KNOWN asset still prints its figure — the guard is not a blanket', () => {
  render(<TxRow tx={tx({ type: 'approve', amount_raw: '1980000' })} userId={VIEWER} />)

  expect(screen.getByText(/1\.98/)).toBeTruthy()
  expect(screen.queryByText(/—/)).toBeNull()
})
