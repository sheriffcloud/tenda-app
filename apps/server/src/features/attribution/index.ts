/**
 * On-chain attribution — the whole feature, in one directory.
 *
 * WHAT IT DOES. Appends an ERC-8021 suffix to the calldata of transactions
 * Tenda originates on a chain whose ecosystem runs an attribution programme
 * (today: Celo). The suffix sits past every ABI-encoded argument, so it changes
 * nothing about what the transaction does — it only makes the transaction
 * attributable to us on a public dashboard.
 *
 * WHY IT IS URGENT RATHER THAN NICE. The tag is part of the signed calldata, so
 * it must be present when the transaction is SENT. There is no backfill: every
 * transaction sent before the wiring lands is permanently unattributed, and on
 * Celo that is the input to every hackathon leaderboard. This is the one piece
 * of work whose cost is measured in transactions you can no longer earn.
 *
 * HOW TO ATTACH IT — one import, one call, wherever calldata is built:
 *
 *   import { tagCalldata } from '@server/features/attribution'
 *   const data = tagCalldata(chain_id, encodeFunctionData({ ... }))
 *
 * There is no registration step, no plugin, and no boot order to respect. A
 * chain with no attribution programme gets its calldata back unchanged, so the
 * call is safe on every chain including ones that do not exist yet.
 *
 * WHERE IT IS ATTACHED TODAY — every place the server produces EVM calldata:
 *   1. `chains/evm/index.ts` buildTx — the escrow transactions a CLIENT signs
 *      and broadcasts (create, accept, submit, approve, dispute). The volume.
 *   2. `chains/evm/relay/index.ts` — `createEscrowFor`, which the RELAYER signs
 *      (#18 agent funding). Tagged before `simulate`, so what is simulated is
 *      what is sent.
 *   3. `chains/evm/sender/sweep.ts` — `refundExpired` / `reclaimAbandoned`, which the
 *      relayer also signs (#43 abandoned-escrow recovery). This one is easy to
 *      forget, and was: the first cut of #83 attached to the two above and this
 *      docblock said "both places". A sweep is a real transaction on a real
 *      chain, so an untagged one is volume that scores nothing.
 *   4. `chains/evm/build/builders.ts` `approvalHint` — the ERC-20 `approve` a client
 *      sends before a plain (non-permit) create or dispute bond (#103). The
 *      server BUILDS that calldata now; see below for what changed and why.
 *
 * THE TEST FOR "HAVE I FOUND THEM ALL" is not this list — lists rot. It is that
 * a call site either returns calldata to a client or hands it to `EvmRelayer`;
 * anything reaching `relayer.simulate`/`relayer.send` must be tagged first.
 *
 * THAT APPROVE IS NOW TAGGED (#103), and the shape of the fix is worth keeping:
 * the hint used to be `{ token, spender, amount_raw }` with each client
 * encoding the call, so there was no server-side calldata to append to. It now
 * also carries `data` — the calldata the server built and tagged — and the
 * clients broadcast that verbatim through `ensureAllowance`. The encoder is
 * shared's `encodeApprove`, the same one the clients fall back to, so the two
 * cannot drift. `data` is OPTIONAL on the wire on purpose: an installed client
 * older than this ignores it, a new client against an older server finds it
 * missing, and both degrade to correct-but-untagged rather than broken.
 *
 * WHAT IS STILL NOT TAGGED, said plainly rather than discovered later: the
 * standing approval set from the Token-approvals SETTINGS screen. That one has
 * no escrow and no server round-trip — the client calls `sendApprove` directly
 * — so there is nothing to hand it. Low volume, and tagging it would mean a
 * server endpoint whose only job is to encode an approve.
 *
 * IMPORT THIS BARREL FROM `src/`, not the files behind it — reaching past it is
 * what turns a removable feature back into a clustered one, and it is `src/`
 * that the removal recipe has to survive. Tests may address a module directly;
 * the source-scan guard in test/unit/attribution-module-boundary.test.ts
 * therefore asserts the rule over `src/` only. That guard also pins the SET of
 * files that use the feature, so the call-site list above cannot rot the way it
 * already did once — it said "both places" while the sweep went untagged.
 *
 * REMOVAL RECIPE — keep this true:
 *   0. delete test/unit/attribution-module-boundary.test.ts, which asserts this
 *      recipe and would otherwise fail on the way out;
 *   1. delete this directory;
 *   2. delete the `tagCalldata(...)` wrap at all four call sites above, leaving
 *      the inner expression, and drop the `chain_id` parameter from
 *      `evmEscrowSweep` and from `approvalHint` — both carry it only to feed
 *      this. `approvalHint` keeps building `data` either way: the clients read
 *      it, and untagged calldata is still correct calldata;
 *   3. delete the `assertAttributionCodes(...)` call in `plugins/chains.ts`;
 *   4. `pnpm --filter tenda-server remove @celo/attribution-tags`;
 *   5. drop `CELO_ATTRIBUTION_CODE` from `.env.example` and any deployment env.
 */

export {
  tagCalldata,
  attributionCodes,
  attributionEnvKey,
  assertAttributionCodes,
  ATTRIBUTION_FAMILIES,
} from './tag'
export { decodeTag, checkTaggedTx, type TagCheck, type TxClient, type TxHash } from './verify'
