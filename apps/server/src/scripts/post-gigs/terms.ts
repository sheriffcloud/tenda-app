/**
 * Reading a 402 answer, for a script that can only sign one kind of them.
 *
 * Its own module for the same reason `book.ts`, `receipts.ts` and `select.ts`
 * are: `main.ts` is the runner, and everything here is a pure function over a
 * wire type with refusals worth exercising on their own. A test that has to
 * boot a run to reach a refusal is a refusal nobody tests.
 */
import type { AgentTaskPaymentRequired, EvmAuthorizationTerms } from '@tenda/shared'

/**
 * The EIP-3009 terms out of a 402 body, or a failure that says which chain and
 * why.
 *
 * The 402's `payment` is a UNION — `eip155-authorization` on EVM,
 * `solana-transaction` on Solana — and this script signs only the first: it
 * builds its wallet with viem's `privateKeyToAccount` and signs typed data.
 * That assumption used to be invisible, because the body was cast to a
 * hand-written shape that declared `typed_data` unconditionally. `--chain
 * solana:devnet` passes every check this script makes (that cluster HAS a gig
 * asset), so the run would register an agent, reach the first quote, read
 * `typed_data` as undefined and die inside viem with nothing naming the cause.
 *
 * Reading the real wire type is what turns that into a compile-time obligation,
 * which is the whole reason the type is imported rather than restated. A
 * restated wire shape on a script that spends real money is a copy of the API
 * that goes stale silently.
 */
export function evmTermsFrom(body: AgentTaskPaymentRequired, chain_id: string): EvmAuthorizationTerms {
  const [terms] = body.accepts
  if (terms === undefined) {
    throw new Error(`the 402 for ${chain_id} carried no terms to sign`)
  }
  if (terms.payment.kind !== 'eip155-authorization') {
    throw new Error(
      `${chain_id} quotes '${terms.payment.kind}' terms; this script funds by EIP-3009 authorization ` +
        'and signs with an EVM key, so it can only post to an eip155 chain',
    )
  }
  return terms.payment
}
