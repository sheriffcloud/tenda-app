/**
 * Machine-checks the parts of .env.example that CAN rot silently (the EVM
 * deploy runbook documented BASE_*-era names long after the loader moved to
 * CHAIN_*; prose can't be tested, but the example file can):
 *   1. every CHAIN_* key it documents is a key the secrets loader reads,
 *   2. every manifest chain has an entry, and every chain that DECLARES a
 *      native gas seed documents the key that funds it,
 *   3. every boot-required var is documented, and
 *   4. SLACK_WEBHOOK_* agrees with the destination registry IN BOTH
 *      DIRECTIONS — an undocumented destination is a channel nobody knows to
 *      configure, which is exactly how an alert path stays quiet, and
 *   5. every OPTIONAL url var is documented, for the same reason as 4 rather
 *      than the same reason as 3: a missing REQUIRED var halts the boot and
 *      names itself, so it cannot stay secret. An optional one just degrades.
 *   6. every attribution family's code var is documented — same reason as 4,
 *      and a sharper one: an operator who copies a misspelt name from here gets
 *      a deployment that sends UNTAGGED transactions, and the tag cannot be
 *      added afterwards (#83). It is outside the CHAIN_* namespace on purpose,
 *      so rule 1 does not cover it.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHAIN_MANIFEST } from '@tenda/shared'
import { OPTIONAL_URL_ENV_VARS, REQUIRED_ENV_VARS } from '@server/config'
import { knownChainEnvKeys } from '@server/chains/secrets'
import { chainEnvPrefix } from '@server/chains/secrets/schema'
import { knownSlackEnvKeys } from '@server/features/alerts/slack'
import { ATTRIBUTION_FAMILIES, attributionEnvKey } from '@server/features/attribution'

/** Env-var names documented in .env.example, commented-out lines included. */
function documentedKeys(): Set<string> {
  const raw = readFileSync(join(__dirname, '../../.env.example'), 'utf8')
  const keys = new Set<string>()
  for (const line of raw.split('\n')) {
    const match = /^#?([A-Z][A-Z0-9_]*)=/.exec(line.trim())
    if (match !== null) keys.add(match[1])
  }
  return keys
}

test('every CHAIN_* var documented in .env.example is one the secrets loader reads', () => {
  const known = knownChainEnvKeys()
  const documented = [...documentedKeys()].filter((k) => k.startsWith('CHAIN_'))
  assert.ok(documented.length > 0, 'expected .env.example to document chain vars')
  const unknown = documented.filter((k) => !known.has(k))
  assert.deepStrictEqual(
    unknown,
    [],
    `stale chain env names in .env.example (the loader would reject these at boot): ${unknown.join(', ')}`,
  )
})

test('every chain in the manifest has an .env.example entry', () => {
  // The OTHER direction from the test above, and the same reasoning as the
  // Slack pair: `documented ⊆ known` only catches names that ROTTED. It cannot
  // catch a chain nobody wrote down — which is how both 0G chains sat in
  // CHAIN_MANIFEST with no entry here at all, undiscoverable to anyone
  // configuring a deployment.
  //
  // RPC_URL is the right sentinel: it is the one key every family needs (the
  // Solana chains take no ESCROW_ADDR, the EVM ones do), and no chain can be
  // activated without it.
  //
  // `chainEnvPrefix` is the LOADER's own derivation, not a copy of it: a test
  // that re-spelled the id → env-name rule could agree with the loader today
  // and drift from it on the next chain id that is shaped differently.
  const documented = documentedKeys()
  const missing = CHAIN_MANIFEST.map((c) => ({
    id: c.id,
    key: `${chainEnvPrefix(c.id)}_RPC_URL`,
  })).filter(({ key }) => !documented.has(key))
  assert.deepStrictEqual(
    missing.map((m) => `${m.id} (${m.key})`),
    [],
    'manifest chains with no .env.example entry — an operator cannot configure them',
  )
})

test("every 'native-seed' chain documents its GAS_SEED_KEY in .env.example", () => {
  // The manifest already enforces `gasSeedAmountRaw iff gasPolicy ===
  // 'native-seed'`, so a chain declaring that policy is declaring it PAYS. The
  // key is what turns the declaration on, and it is optional — unset leaves the
  // seed dormant, which looks exactly like a chain that never had one.
  //
  // Not caught by the RPC_URL test above, and that is the whole point: 16602
  // had a complete, correct block here and ran a funded seed for a day with its
  // own key undocumented. The sentinel has to be the field the policy implies,
  // not the field every chain shares.
  //
  // Deliberately NOT generalised to "every optional field must be documented":
  // this file omits PAYMASTER_URL and WEBHOOK_SECRET on the 0G and CELO chains
  // on purpose, because their manifests support neither and documenting them
  // would advertise something that does nothing. `gasPolicy` is the manifest's
  // own statement about which chains are the exception.
  const documented = documentedKeys()
  const missing = CHAIN_MANIFEST.filter((c) => c.gasPolicy === 'native-seed')
    .map((c) => ({ id: c.id, key: `${chainEnvPrefix(c.id)}_GAS_SEED_KEY` }))
    .filter(({ key }) => !documented.has(key))
  assert.deepStrictEqual(
    missing.map((m) => `${m.id} (${m.key})`),
    [],
    'chains that declare a native gas seed but document no key to fund it with',
  )
})

test('every boot-required env var is documented in .env.example', () => {
  const documented = documentedKeys()
  const missing = REQUIRED_ENV_VARS.filter((k) => !documented.has(k))
  assert.deepStrictEqual(missing, [], `undocumented required vars: ${missing.join(', ')}`)
})

test('every SLACK_WEBHOOK_* var documented in .env.example is one a destination reads', () => {
  const known = knownSlackEnvKeys()
  const documented = [...documentedKeys()].filter((k) => k.startsWith('SLACK_WEBHOOK_'))
  assert.ok(documented.length > 0, 'expected .env.example to document the Slack webhook vars')
  const unknown = documented.filter((k) => !known.has(k))
  assert.deepStrictEqual(
    unknown,
    [],
    `stale Slack env names in .env.example (no destination reads these): ${unknown.join(', ')}`,
  )
})

test('every Slack destination in the registry is documented in .env.example', () => {
  const documented = documentedKeys()
  const undocumented = [...knownSlackEnvKeys()].filter((k) => !documented.has(k))
  assert.deepStrictEqual(
    undocumented,
    [],
    `Slack destinations with no .env.example entry (operators cannot enable them): ${undocumented.join(', ')}`,
  )
})

test('every optional URL env var is documented in .env.example', () => {
  // Only one direction, unlike the Slack pair above: a URL-shaped var in
  // .env.example that config.ts does NOT validate is not a defect — API_BASE_URL
  // is required rather than optional, and a doc-only entry for something the
  // server never reads would be caught by nothing here anyway. What matters is
  // that everything the boot validator is willing to police has an entry an
  // operator can find.
  const documented = documentedKeys()
  const undocumented = OPTIONAL_URL_ENV_VARS.filter((k) => !documented.has(k))
  assert.deepStrictEqual(
    undocumented,
    [],
    `optional URL vars with no .env.example entry — unset they degrade in silence: ${undocumented.join(', ')}`,
  )
})

test('every attribution family documents the env var its code is read from', () => {
  const documented = documentedKeys()
  assert.ok(ATTRIBUTION_FAMILIES.length > 0, 'expected at least one attribution scheme')
  const missing = ATTRIBUTION_FAMILIES.map(attributionEnvKey).filter((k) => !documented.has(k))
  assert.deepStrictEqual(
    missing,
    [],
    `attribution env var(s) not documented in .env.example: ${missing.join(', ')}`,
  )
})
