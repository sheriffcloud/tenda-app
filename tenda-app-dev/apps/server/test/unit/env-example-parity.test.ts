/**
 * Machine-checks the parts of .env.example that CAN rot silently (the EVM
 * deploy runbook documented BASE_*-era names long after the loader moved to
 * CHAIN_*; prose can't be tested, but the example file can):
 *   1. every CHAIN_* key it documents is a key the secrets loader reads,
 *   2. every boot-required var is documented, and
 *   3. SLACK_WEBHOOK_* agrees with the destination registry IN BOTH
 *      DIRECTIONS — an undocumented destination is a channel nobody knows to
 *      configure, which is exactly how an alert path stays quiet, and
 *   4. every OPTIONAL url var is documented, for the same reason as 3 rather
 *      than the same reason as 2: a missing REQUIRED var halts the boot and
 *      names itself, so it cannot stay secret. An optional one just degrades.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHAIN_MANIFEST } from '@tenda/shared'
import { OPTIONAL_URL_ENV_VARS, REQUIRED_ENV_VARS } from '@server/config'
import { knownChainEnvKeys } from '@server/chains/secrets'
import { chainEnvPrefix } from '@server/chains/secrets/schema'
import { knownSlackEnvKeys } from '@server/lib/slack'

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
