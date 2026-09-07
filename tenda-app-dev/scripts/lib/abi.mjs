/**
 * Pure ABI-extraction logic for sync-abi (kept separate from the CLI so it is
 * unit-testable without filesystem I/O). The forge artifact carries the full
 * compiler output; the apps only need `{ contractName, abi }`.
 */

/**
 * Build the canonical shared-ABI file contents from a forge artifact.
 *
 * @param {string} artifactJson - raw forge artifact JSON (out/<C>.sol/<C>.json)
 * @param {string} contractName - logical contract name (derived from the path
 *   by the CLI — never hardcoded, so renaming the contract can't drift)
 * @returns {string} file contents (pretty JSON + trailing newline)
 */
export function buildSharedAbi(artifactJson, contractName) {
  if (typeof contractName !== 'string' || contractName.length === 0) {
    throw new Error('buildSharedAbi: contractName is required')
  }
  let parsed
  try {
    parsed = JSON.parse(artifactJson)
  } catch (err) {
    throw new Error(`buildSharedAbi: artifact is not valid JSON (${err.message})`)
  }
  if (!Array.isArray(parsed.abi)) {
    throw new Error('buildSharedAbi: artifact has no `abi` array')
  }
  return JSON.stringify({ contractName, abi: parsed.abi }, null, 2) + '\n'
}
