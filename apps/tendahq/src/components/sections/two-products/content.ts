/**
 * §03 Two products — one sheet, ruled down the middle. Both halves share the
 * same shape so the eye reads them as siblings: a mono name, a count chip, a
 * headline ending on the period, a paragraph, three example rows, a foot line.
 */

import {
  CATEGORY_LABELS_PROSE,
  CURRENCIES,
  EXAMPLE_TASKS,
  EXAMPLE_TRADES,
  EXCHANGE_ASSET_SYMBOLS_PROSE,
  GIG_ASSET_SYMBOL,
  GIG_CATEGORIES,
  TRADE_COUNTRIES_PROSE,
  TRADE_CURRENCIES,
  TRADE_MARKET_COUNT,
} from '@/content'

export interface ProductRow {
  /** The left cell: a flag and a line of text. */
  label: string
  /** The right cell, in mono: an amount or a currency code. */
  value: string
}

export interface ProductPanel {
  id: 'gigs' | 'exchange'
  /** The mono name at the top — "tenda / gigs". */
  name: string
  /** The count chip beside it. */
  count: string
  /** The headline, without its period — the panel draws that in brand blue. */
  headline: string
  body: string
  rows: readonly ProductRow[]
  /** The eyebrow line at the foot. */
  foot: string
}

/** Which showcased gigs the gigs half lists, in order. */
const GIG_ROW_IDS = ['t-01', 't-14', 't-15'] as const
/** Which showcased corridors the exchange half lists, in order. */
const TRADE_ROW_IDS = ['x-01', 'x-11', 'x-03'] as const

const gigRows: ProductRow[] = GIG_ROW_IDS.map((id) => {
  const task = EXAMPLE_TASKS.find((t) => t.id === id)
  if (task === undefined) throw new Error(`two products: no example task ${id}`)
  return { label: `${task.flag} ${task.title}`, value: `${task.amountUsdc} ${GIG_ASSET_SYMBOL}` }
})

const tradeRows: ProductRow[] = TRADE_ROW_IDS.map((id) => {
  const trade = EXAMPLE_TRADES.find((t) => t.id === id)
  if (trade === undefined) throw new Error(`two products: no example trade ${id}`)
  const { flag } = CURRENCIES[trade.fiat.currency]
  return {
    label: `${flag} Sell ${trade.asset.amount} ${trade.asset.symbol} · ${trade.fiat.rail.toLowerCase()}`,
    value: trade.fiat.currency,
  }
})

export const PRODUCT_PANELS: readonly ProductPanel[] = [
  {
    id: 'gigs',
    name: 'tenda / gigs',
    count: `${GIG_CATEGORIES.length} categories`,
    headline: 'Gigs that pay on proof',
    // The category list is DERIVED from shared's labels; a hand-typed list
    // once printed the enum key `photo` beside a chip reading "Creative".
    body: `Post or accept tasks — ${CATEGORY_LABELS_PROSE}. Funds lock when a gig is posted. Workers submit photo or video proof. Approval releases the ${GIG_ASSET_SYMBOL} on the spot.`,
    rows: gigRows,
    foot: `Escrowed in ${GIG_ASSET_SYMBOL} on every chain`,
  },
  {
    id: 'exchange',
    name: 'tenda / exchange',
    count: `${TRADE_MARKET_COUNT} markets`,
    headline: 'Crypto ↔ local cash, without the middle',
    body: `Trade ${EXCHANGE_ASSET_SYMBOLS_PROSE} for local cash in ${TRADE_COUNTRIES_PROSE}. You and your counterparty settle over whatever rail you both use. Tenda never touches the cash.`,
    rows: tradeRows,
    // The seller prices their own offer and Tenda takes no spread — said
    // here because the rows above divide out to a rate a visitor would
    // otherwise read as Tenda's.
    foot: `${TRADE_CURRENCIES.join(' · ')} — the seller sets the rate, not Tenda`,
  },
] as const

export const TWO_PRODUCTS_HEADER = {
  eyebrow: 'Two products',
  aside: 'One wallet · one escrow',
  h2: ['Work, and the money', 'that comes after it'],
  sub: `Gigs and P2P trade run on the same contract. Earn ${GIG_ASSET_SYMBOL} on one side, turn it into local cash on the other — without leaving the app or handing custody to anyone.`,
} as const

/** The spine closing the sheet. The last word ends on the period. */
export const TWO_PRODUCTS_BRIDGE = ['Same wallet', 'Same escrow', 'One app'] as const
