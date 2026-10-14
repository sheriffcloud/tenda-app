/**
 * A durable record of what a run actually posted.
 *
 * Every successful post funds an escrow on a real chain, and the only handle
 * for cancelling one later is its escrow id. Terminal scrollback is not a
 * record: a run can be cut short by the rate limiter (one preview run was), the
 * window can be closed, the output can scroll away — and the money is still
 * committed. So each receipt is appended the moment its 201 lands, BEFORE the
 * next gig is attempted, which means a run that dies halfway still leaves an
 * exact record of everything it funded.
 *
 * JSONL rather than a JSON array: appending a line cannot corrupt the lines
 * already written, whereas rewriting an array can lose the whole file if the
 * process dies mid-write. A partial last line is one lost receipt; a truncated
 * array is all of them.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Where a run's receipts live: beside the agent-id script's, under the server
 * package's `receipts/` root, and COMMITTED — a task id that exists only on
 * one laptop is not a handle for cancelling a mainnet gig. Relative to the
 * working directory, which `pnpm --filter tenda-server` makes this package.
 */
export const RECEIPT_DIR = 'receipts/post-gigs'

export interface Receipt {
  /** When it was posted, ISO 8601. */
  at: string
  /** Which deployment — mainnet and preview receipts must never be confused. */
  api: string
  chain_id: string
  /** THE handle for cancelling this gig later. */
  task_id: string
  /** The funding transaction, for auditing against the chain. */
  tx_ref: string
  title: string
  amount_raw: string
  /** Whether a submission waits on the creator; an agent has no listener. */
  requires_approval: boolean
}

/** One line, flushed immediately — see the module note on why this is sync. */
export function appendReceipt(path: string, receipt: Receipt): void {
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(receipt)}\n`, 'utf8')
}

/**
 * Where receipts go when `--out` is not given.
 *
 * Keyed by API host so a mainnet run cannot append into the file a preview run
 * wrote: cancelling against the wrong deployment is exactly the mistake this
 * file exists to prevent, and one shared filename would invite it.
 */
export function defaultReceiptPath(api: string): string {
  const host = (() => {
    try {
      return new URL(api).host.replace(/[^A-Za-z0-9.-]/g, '_')
    } catch {
      // A malformed --api fails later with a clearer message than this would.
      return 'unknown-host'
    }
  })()
  return `${RECEIPT_DIR}/${host}.jsonl`
}
