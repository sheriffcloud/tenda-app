import { SwipeDeck } from '@/components/ui/SwipeDeck'
import { TradeCard } from '@/components/product/TradeCard'
import { EXAMPLE_TRADES } from '@/content'
import { TRADE_DECK_CAPTION } from './content'

/**
 * §03 Exchange panel centerpiece — the P2P mirror of the hero's TaskDeck:
 * example corridors (crypto side → fiat side) swipe up through the stack,
 * sourced from content/trades.ts. Offset from the hero's tempo so the two
 * decks never tick in sync.
 */
export function TradeDeck() {
  return (
    <div className="flex flex-col gap-3">
      {/* Height owns the deck: TradeCard (~150px) + stack offsets. */}
      <SwipeDeck
        items={EXAMPLE_TRADES}
        keyOf={(trade) => trade.id}
        renderItem={(trade) => <TradeCard trade={trade} />}
        intervalMs={3400}
        className="h-[210px]"
      />
      <p className="caption text-center uppercase tracking-[0.16em] text-[var(--content-tertiary)]">
        {TRADE_DECK_CAPTION}
      </p>
    </div>
  )
}
