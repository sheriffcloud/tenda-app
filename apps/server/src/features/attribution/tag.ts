/**
 * Stamping a transaction with WHO SENT IT — the encode half of the feature.
 *
 * ERC-8021 attribution puts a short suffix at the end of a transaction's
 * calldata. It changes nothing about what the transaction DOES — the suffix
 * sits past every ABI-encoded argument, so the contract's decoder never reads
 * it — and what it buys is that the transaction is attributable to Tenda on
 * Celo's public dashboard.
 *
 * WHAT IT COSTS: a code costs its own length plus one byte, on top of a 34-byte
 * envelope — so one 17-character code encodes to 35 bytes, and TWO to 53, not
 * the 51 an earlier revision of this line recorded (that pair had a 15-character
 * second code; the tag assigned at registration is 17). The gas is MEASURED as
 * an `eth_estimateGas` delta, tagged vs untagged, 2026-09-05 — Celo mainnet
 * +552 / +809, Celo Sepolia +552 / +808, 0G mainnet +556 / +816, all at the
 * 35/51-byte sizes.
 *
 * The pair ACTUALLY configured — `codeFromHostname('tendahq.com')` =
 * `celo_558f532905be` first, the registration tag `celo_b395323d136c` second —
 * is 53 bytes and was re-measured on Celo mainnet 2026-09-06 against a 68-byte
 * ABI body: +549 for one code, **+838 for the pair**. Two more non-zero calldata
 * bytes than the 51-byte figure, which is the whole of the difference.
 *
 * Byte arithmetic at EIP-2028 rates (34 non-zero x 16 + 1 zero x 4) predicts
 * 548 / 804, so the real charge runs a little above the calldata arithmetic and
 * varies by chain. Quote the measured figure: an earlier version of this
 * docblock printed the computed one and called it "measured", which is the
 * failure mode this file keeps warning about elsewhere.
 *
 * "THE DECODER NEVER READS IT" IS MEASURED TOO. `eth_call` against the live
 * TendaEscrow (0G mainnet 0x9d0193f7…, 2026-09-05), tagged vs untagged, byte
 * for byte:
 *   - `approvalWindowSeconds()` -> 0x…02a300 both ways (zero-arg dispatch);
 *   - `relayers(address)`, `escrows(bytes16)`, `getEscrow(bytes16)` -> identical
 *     both ways (one-arg, so the ABI decoder ran on real arguments);
 *   - `reclaimAbandoned/acceptEscrow/approveCompletion(bytes16)` -> both revert
 *     `EscrowNotFound()` (0xf1d80ab1), which is the BUSINESS error: the
 *     dispatcher decoded the argument and reached the lookup. A decode or
 *     fallback failure would have produced a different selector.
 * Those last three are state-changing, so `eth_call` on them is exactly what
 * `relayer.simulate` sends — this is the simulation, not an analogy for one.
 *
 * KEYED BY FAMILY, NOT BY CHAIN ID. Attribution is a property of a NETWORK
 * FAMILY's ecosystem programme, not of one deployment: Celo mainnet and Celo
 * Sepolia share a scheme and a code, and a future Celo network would too. So
 * `SCHEMES` is keyed by the manifest's own `family`, and a new Celo network is
 * one manifest entry with zero edits here — the same property the chain
 * manifest already guarantees for RPC and contract addresses.
 *
 * A CHAIN WITH NO SCHEME IS NORMAL, NOT AN ERROR. Solana, Base and 0G run no
 * attribution programme, so `tagCalldata` returns their calldata untouched and
 * says nothing about it. This is the shape an unknown chain also takes, which
 * is what makes the feature safe to leave attached while chains come and go.
 */

import { toDataSuffix } from '@celo/attribution-tags'
import { findChain } from '@tenda/shared'
import { optionalEnv } from '@server/config/env'

/** Calldata, or a bare suffix — both are 0x-hex and both are concatenated raw. */
type Hex = `0x${string}`

/**
 * How each network family encodes a set of attribution codes into a calldata
 * suffix. One entry today; a second scheme is one more line and no change to
 * any call site, which is the point of the indirection.
 *
 * The value is the SDK's `toDataSuffix` rather than a hand-rolled encoder on
 * purpose — the wire format has a length byte and a 16-byte marker, and a
 * second implementation of it is a second thing to keep correct against a spec
 * we do not own.
 */
const SCHEMES: Readonly<Record<string, (codes: readonly string[]) => Hex>> = {
  celo: toDataSuffix,
}

/**
 * Every network family that has an attribution scheme.
 *
 * Derived from `SCHEMES` rather than listed, and exported for ONE reason: the
 * .env.example parity test walks it, so documenting a second family's key stops
 * being something a human has to remember. Without it the docs and the reader
 * are joined only by a name typed twice — which is how `CELO_ATTRIBUTION_CODE`
 * could be renamed in the example file with the whole suite staying green.
 */
export const ATTRIBUTION_FAMILIES: readonly string[] = Object.freeze(Object.keys(SCHEMES))

/**
 * The env var a family's code is read from, DERIVED rather than listed, so a
 * new scheme above needs no second edit to stay configurable.
 */
export function attributionEnvKey(family: string): string {
  return `${family.toUpperCase()}_ATTRIBUTION_CODE`
}

/**
 * The family whose scheme applies to this chain, or null when none does.
 *
 * `Object.hasOwn`, not a bare index: `SCHEMES['constructor']` answers with
 * something truthy that is not an encoder, and calling it would throw deep
 * inside a transaction build. Families come from the manifest today so this is
 * not reachable, but the same guard on the same kind of lookup is what
 * `getAssetMeta` learned to do the hard way.
 */
function schemeFamily(chain_id: string): string | null {
  const family = findChain(chain_id)?.family
  return family !== undefined && Object.hasOwn(SCHEMES, family) ? family : null
}

/**
 * The attribution codes configured for a chain, in the order they were written.
 *
 * COMMA-SEPARATED because ERC-8021 carries a set, and the hackathon's own
 * instruction is to send both our code and the assigned one:
 * `CELO_ATTRIBUTION_CODE=celo_ourcode,celo_assigned`. Only the assigned tag is
 * credited on their leaderboard. Carrying our own beside it costs one byte per
 * character plus a comma (16 bytes for a 15-character code, measured), and it
 * is the code that is not scoped to one event — the assigned one stops meaning
 * anything when the hackathon ends.
 *
 * An unset or blank var yields an empty list — `optionalEnv` is the one place
 * that rule lives, so a commented-out line reads as "not configured" here the
 * same way it does for every other env reader.
 */
export function attributionCodes(
  chain_id: string,
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const family = schemeFamily(chain_id)
  if (family === null) return []
  const raw = optionalEnv(attributionEnvKey(family), env)
  if (raw === null) return []
  return raw
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code.length > 0)
}

/**
 * `data` with this chain's attribution suffix appended, or `data` unchanged.
 *
 * THE ONE FUNCTION A CALL SITE NEEDS. Attach it wherever calldata is produced
 * for a transaction Tenda originates, pass the chain id, and every other
 * question — which chains, which codes, what encoding, whether it is configured
 * at all — is answered in this file.
 *
 * IT APPENDS UNCONDITIONALLY, including to empty calldata, and that is safe
 * here rather than safe in general: appending to `'0x'` would turn a bare value
 * transfer into a data-carrying transaction, which a contract recipient could
 * see as a fallback call. No such path exists on Celo — both Celo chains are
 * `gasPolicy: 'feeCurrency'`, so they run no native gas-seed transfer, and every
 * other Celo transaction the server builds is an ABI-encoded contract call.
 * `assertAttributionCodes` passes `'0x'` on purpose and throws the result away.
 *
 * IT THROWS on a malformed code, and that is deliberate. `toDataSuffix` rejects
 * anything outside `[a-z0-9_]`, longer than 32 bytes, or over 255 bytes joined.
 * Swallowing that would ship transactions that look fine and are permanently
 * uncounted — the tag lives in calldata, so it cannot be added after the fact
 * and there is no backfill. A configuration error must be loud, and
 * `assertAttributionCodes` exists so it is loud at BOOT rather than under a
 * user pressing "post gig".
 */
export function tagCalldata(
  chain_id: string,
  data: Hex,
  env: NodeJS.ProcessEnv = process.env,
): Hex {
  const family = schemeFamily(chain_id)
  if (family === null) return data
  const codes = attributionCodes(chain_id, env)
  if (codes.length === 0) return data
  // Raw concatenation: the suffix is appended to the END of the calldata, which
  // is where `fromDataSuffix` parses from. Slicing '0x' off the suffix is the
  // whole of the join.
  return `${data}${SCHEMES[family](codes).slice(2)}`
}

/**
 * Throw if any configured attribution code would be rejected at send time.
 *
 * Called once at boot so a typo in `CELO_ATTRIBUTION_CODE` is a startup failure
 * naming the variable, not a 500 on the first user to fund an escrow. Silent on
 * a chain with no scheme and on an unset code, because neither is an error —
 * running untagged is a valid deployment, running MIS-tagged is not.
 */
export function assertAttributionCodes(
  chain_ids: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): void {
  for (const chain_id of chain_ids) {
    const family = schemeFamily(chain_id)
    if (family === null) continue
    try {
      // Validated by RUNNING the real path on throwaway calldata, not by
      // re-deriving what it would have done. A second copy of "which codes, and
      // do they encode?" is a second thing to keep in step, and the failure it
      // would cause is the one nobody notices: a boot check that passes for a
      // configuration the builder then rejects.
      tagCalldata(chain_id, '0x', env)
    } catch (err) {
      throw new Error(
        `${attributionEnvKey(family)} is not a valid attribution code set ` +
          `(${attributionCodes(chain_id, env).join(', ')}): ` +
          `${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}
