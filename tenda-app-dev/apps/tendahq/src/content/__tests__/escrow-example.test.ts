import { describe, expect, it } from 'vitest'
import { FEE_EXAMPLE, GIG_ASSET_SYMBOL, LANDING_CHAINS } from '@/content'
import { EXAMPLE_ESCROW } from '../escrow-example'

/**
 * The custody line used to name the first live chain, which a second mainnet
 * would have silently made wrong. It now names none, and this keeps it so.
 */
describe('the custody line', () => {
  it('says who holds the money and names no chain, so a new mainnet cannot date it', () => {
    expect(EXAMPLE_ESCROW.custody).toBe('Held by the escrow contract')
    for (const chain of LANDING_CHAINS) {
      expect(EXAMPLE_ESCROW.custody).not.toContain(chain.name)
      expect(EXAMPLE_ESCROW.custody).not.toContain(chain.id)
    }
  })
})

describe('the shared example escrow', () => {
  it('derives every row from the worked fee example, marking only the payout as money', () => {
    const [locked, fee, payout] = EXAMPLE_ESCROW.rows
    expect(locked.value).toBe(`${EXAMPLE_ESCROW.amount} ${GIG_ASSET_SYMBOL}`)
    expect(fee.value).toBe(`${FEE_EXAMPLE.feeAmount} ${GIG_ASSET_SYMBOL}`)
    expect(payout.value).toBe(FEE_EXAMPLE.payout)
    expect(EXAMPLE_ESCROW.rows.filter((r) => 'money' in r && r.money)).toEqual([payout])
  })
})
