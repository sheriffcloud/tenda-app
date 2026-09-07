/**
 * Exchange offer detail route — auth-gated (exchange is never public).
 *
 * A failed read is a STATE, not an absence, and the two failures say different
 * things: an offer that is GONE was taken, cancelled or withdrawn, and the way
 * forward is the book; an offer that merely failed to LOAD is still there, and
 * the way forward is to retry. Collapsing them into one message sent readers
 * back to the market for an offer that was fine.
 */
import { ExchangeDetailRoute } from '@/components/exchange/ExchangeDetailRoute'

export default async function ExchangeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <ExchangeDetailRoute id={id} />
}
