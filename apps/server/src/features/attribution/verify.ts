/**
 * Reading the tag back off a transaction — the decode half of the feature.
 *
 * This exists because of an asymmetry the hackathon states outright: a tag
 * lives in calldata, so it has to be there when the transaction is SENT and
 * there is no backfill. A wiring mistake is therefore not a bug you fix, it is
 * volume you never get back — which makes "did tx #1 actually carry it?" the
 * one question worth answering before the second transaction, not after the
 * hundredth.
 *
 * NO TRANSPORT IS BUILT HERE. `TxClient` is the SDK's own structural type — an
 * object with `getTransaction({ hash })` — so the caller injects a reader built
 * from `chains/rpc`, which stays the only place a transport is constructed. It
 * also means the unit suite drives this with a plain object and no network.
 */

import {
  fromDataSuffix,
  verifyTx,
  type DecodedSuffix,
  type TxClient,
  type TxHash,
} from '@celo/attribution-tags'
import { attributionCodes } from './tag'

export type { TxClient, TxHash }

/**
 * What a transaction turned out to carry.
 *
 * A DISCRIMINATED RESULT, because "no tag at all" and "a tag missing the code
 * that scores" are different failures with different fixes — the first is an
 * unattached call site, the second a misconfigured env — and a single nullable
 * return conflates them into "something is wrong".
 */
export type TagCheck =
  | { status: 'untagged' }
  | { status: 'tagged'; codes: readonly string[]; schemaId: number; missing: readonly string[] }

/**
 * One decoded suffix, expressed as the result both entry points return.
 *
 * Named once because the offline and the on-chain check answer the SAME
 * question from different sources, and two copies of "which expected codes are
 * absent" is two places for that comparison to drift.
 *
 * Takes the SDK's own `DecodedSuffix`, not a structural copy of its shape. The
 * copy this replaced would still have compiled if the SDK grew a field, and the
 * new field would have been silently dropped on the floor.
 */
function toCheck(decoded: DecodedSuffix | null, expected: readonly string[]): TagCheck {
  if (decoded === null) return { status: 'untagged' }
  return {
    status: 'tagged',
    codes: decoded.codes,
    schemaId: decoded.schemaId,
    missing: expected.filter((code) => !decoded.codes.includes(code)),
  }
}

/**
 * Decode whatever attribution suffix `data` ends with, without a network call.
 *
 * `fromDataSuffix` parses from the END of full calldata, so this takes the whole
 * `data` field rather than a pre-sliced suffix. Answers `untagged` for anything
 * that is not a clean Schema 0 tag — no marker, a reserved schema id, an empty
 * code field — which is the same answer an untagged transaction gives, because
 * from a scoring point of view they are the same outcome.
 */
export function decodeTag(data: `0x${string}`, expected: readonly string[] = []): TagCheck {
  return toCheck(fromDataSuffix(data), expected)
}

/**
 * Fetch a sent transaction and report whether it carries the codes this
 * deployment is configured to send on that chain.
 *
 * `missing` is checked against the CONFIGURED codes rather than a value passed
 * in, so the check asks the question that matters — "is the tag I believe I am
 * sending actually on-chain?" — instead of re-stating a constant the caller
 * already holds.
 *
 * `verifyTx` never throws; an RPC failure decodes as `untagged`. That is the
 * safe direction for a check whose job is to raise an alarm: a network blip
 * reads as "not proven tagged", never as "confirmed fine".
 */
export async function checkTaggedTx(args: {
  chain_id: string
  client: TxClient
  hash: TxHash
  env?: NodeJS.ProcessEnv
}): Promise<TagCheck> {
  const expected = attributionCodes(args.chain_id, args.env ?? process.env)
  return toCheck(await verifyTx({ client: args.client, hash: args.hash }), expected)
}
