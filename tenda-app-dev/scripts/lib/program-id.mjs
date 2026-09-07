/**
 * Program-id consistency check (pure, unit-testable). The Solana program id
 * lives in four places that must never disagree:
 *   - `declare_id!(...)` in the program's lib.rs
 *   - the `[programs.*]` entries in Anchor.toml (one per cluster)
 *   - the `address` field embedded in the generated IDL
 * A mismatch means a deploy/build/IDL drift the artifact drift-guard alone
 * would miss, so CI asserts all four are equal.
 */

// Solana base58 (no 0 O I l); on-chain pubkeys are 32–44 chars.
const BASE58_ADDR = '[1-9A-HJ-NP-Za-km-z]{32,44}'

/** @returns {string|null} the id inside declare_id!("..."), or null if absent */
export function parseDeclareId(libRs) {
  const m = libRs.match(new RegExp(`declare_id!\\(\\s*"(${BASE58_ADDR})"\\s*\\)`))
  return m ? m[1] : null
}

/** @returns {string[]} every `<prog> = "<id>"` id under Anchor.toml [programs.*] */
export function parseAnchorTomlIds(anchorToml) {
  const ids = []
  const re = new RegExp(`=\\s*"(${BASE58_ADDR})"`, 'g')
  let m
  while ((m = re.exec(anchorToml)) !== null) ids.push(m[1])
  return ids
}

/** @returns {string|null} the IDL `address` field */
export function parseIdlAddress(idlJson) {
  const parsed = typeof idlJson === 'string' ? JSON.parse(idlJson) : idlJson
  return typeof parsed.address === 'string' ? parsed.address : null
}

/**
 * @param {{ libRs: string, anchorToml: string, idlJson: string }} sources
 * @returns {{ declareId: string|null, tomlIds: string[], idlAddress: string|null }}
 */
export function extractProgramIds({ libRs, anchorToml, idlJson }) {
  return {
    declareId: parseDeclareId(libRs),
    tomlIds: parseAnchorTomlIds(anchorToml),
    idlAddress: parseIdlAddress(idlJson),
  }
}

/**
 * Throw unless declare_id, every Anchor.toml id, and the IDL address are all
 * present and identical.
 *
 * @param {{ declareId: string|null, tomlIds: string[], idlAddress: string|null }} ids
 */
export function assertProgramIdsConsistent(ids) {
  const { declareId, tomlIds, idlAddress } = ids
  if (declareId === null) throw new Error('program-id: no declare_id!(...) found in lib.rs')
  if (tomlIds.length === 0) throw new Error('program-id: no program ids found in Anchor.toml')
  if (idlAddress === null) throw new Error('program-id: IDL has no `address` field')

  const all = new Set([declareId, ...tomlIds, idlAddress])
  if (all.size !== 1) {
    throw new Error(
      `program-id mismatch: declare_id=${declareId} ` +
        `anchorToml=[${tomlIds.join(', ')}] idl=${idlAddress}`,
    )
  }
  return declareId
}
