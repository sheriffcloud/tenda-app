/**
 * WHICH env vars a chain reads, and what a well-formed value looks like.
 *
 * The half of the loader that depends only on the manifest — no env, no
 * results. Adding a field to a namespace is an edit here and nowhere else,
 * which is the property worth protecting: the resolved shape in ./resolve
 * mirrors this 1:1, so the compiler objects if the two drift.
 */

import bs58 from 'bs58'
import { CHAIN_MANIFEST, type ChainManifestEntry } from '@tenda/shared'
import { ABSOLUTE_PREFIX, isAbsoluteUrl } from '@server/lib/env'

/** An ed25519 secret key as web3's `Keypair.fromSecretKey` takes it: 64 raw bytes. */
const ED25519_SECRET_KEY_BYTES = 64

/** Validation classes for a secret value. */
export type SecretKind = 'url' | 'evmAddr' | 'evmKey' | 'base58' | 'base58Key' | 'uint' | 'bool' | 'str'

export interface SecretFieldSpec {
  /** Logical key on the resolved record. */
  key: string
  /** Env-var suffix appended after the sanitised chain id. */
  envSuffix: string
  required: boolean
  kind: SecretKind
}

/**
 * Secret schema keyed by NAMESPACE (not family): every EVM chain reads the
 * same fields, every Solana chain reads the same fields, so adding an EVM L2
 * needs no schema change. The resolved record's shape mirrors this 1:1.
 */
export const SECRET_SCHEMA: Record<string, readonly SecretFieldSpec[]> = {
  // NOTE: the Solana program id is NOT a secret, it is the deployed IDL
  // artifact (ESCROW_IDL.address), the single source used by the adapter,
  // pdas, and the seeder. Treasury + RPC are the genuine per-deployment values.
  solana: [
    { key: 'rpcUrl', envSuffix: 'RPC_URL', required: true, kind: 'url' },
    { key: 'rpcUrlFallback', envSuffix: 'RPC_URL_FALLBACK', required: false, kind: 'url' },
    { key: 'treasury', envSuffix: 'TREASURY_ADDR', required: true, kind: 'base58' },
    // On-chain dispute-resolution authority (rotatable via the multisig).
    // Optional: enables the admin sign pre-flight check when set.
    { key: 'disputeAdmin', envSuffix: 'DISPUTE_ADMIN_ADDR', required: false, kind: 'base58' },
    { key: 'usdcMint', envSuffix: 'USDC_MINT', required: false, kind: 'base58' },
    { key: 'gasSeedKey', envSuffix: 'GAS_SEED_KEY', required: false, kind: 'str' },
    { key: 'webhookSecret', envSuffix: 'WEBHOOK_SECRET', required: false, kind: 'str' },
    // Relayer hot wallet for agent funding (#18): fee payer of relayed
    // creates. base58 64-byte secret (the shape GAS_SEED_KEY has, checked
    // here so a typo is a boot error naming the key); absent = the fund
    // route answers RELAY_UNAVAILABLE on this chain.
    { key: 'relayerKey', envSuffix: 'RELAYER_KEY', required: false, kind: 'base58Key' },
  ],
  eip155: [
    { key: 'rpcUrl', envSuffix: 'RPC_URL', required: true, kind: 'url' },
    // Secondary RPC endpoint: when set, the adapter's transport fails over to
    // it on primary errors/timeouts (a degraded provider can't block tx builds).
    { key: 'rpcUrlFallback', envSuffix: 'RPC_URL_FALLBACK', required: false, kind: 'url' },
    { key: 'escrow', envSuffix: 'ESCROW_ADDR', required: true, kind: 'evmAddr' },
    // Block the escrow contract was deployed at: the polling listener's exact
    // first-run start (no event can predate it). Optional: absent falls back
    // to the listener's bounded recency window, with a boot-time warning.
    { key: 'escrowDeployBlock', envSuffix: 'ESCROW_DEPLOY_BLOCK', required: false, kind: 'uint' },
    { key: 'treasury', envSuffix: 'TREASURY_ADDR', required: true, kind: 'evmAddr' },
    { key: 'disputeAdmin', envSuffix: 'DISPUTE_ADMIN_ADDR', required: false, kind: 'evmAddr' },
    { key: 'paymasterUrl', envSuffix: 'PAYMASTER_URL', required: false, kind: 'url' },
    { key: 'webhookSecret', envSuffix: 'WEBHOOK_SECRET', required: false, kind: 'str' },
    // Relayer hot wallet for agent funding (#18): sends createEscrowFor and
    // pays its gas. 0x-hex secp256k1 private key; absent = RELAY_UNAVAILABLE.
    { key: 'relayerKey', envSuffix: 'RELAYER_KEY', required: false, kind: 'evmKey' },
    // First-link native-gas seed (#53a): the hot wallet that pays a new user's
    // one-time native grant on a `native-seed` chain. Its OWN key, never the
    // relayer's, for the same reason `sweepEnabled` is its own switch — the
    // relayer float serves a flow someone asked for, the seed is an open-ended
    // outflow to every user who links a wallet, and one key must not be both.
    // Solana keeps the same separation. Absent = the seed stays dormant: the
    // chain's gas columns seed NULL and dispatch never sees the chain.
    { key: 'gasSeedKey', envSuffix: 'GAS_SEED_KEY', required: false, kind: 'evmKey' },
    // Abandoned-escrow sweeping (#43): pay gas to refund creators who never
    // came back for their own funds. Default OFF, and deliberately a SEPARATE
    // switch from `relayerKey` even though it spends the same wallet — relaying
    // is gas spent serving a flow an agent asked for, sweeping is an open-ended
    // outflow on escrows nobody asked us to touch. Tying it to the key would
    // mean enabling agent funding silently enabled the second one too.
    { key: 'sweepEnabled', envSuffix: 'SWEEP_ENABLED', required: false, kind: 'bool' },
  ],
}

/**
 * Schemes a chain endpoint may use. NAMED rather than an inline
 * `['https', 'http']` at the call site: config.ts's BASE_URL_PROTOCOLS carries
 * a comment warning that a second spelling of a protocol policy is "a
 * difference nothing would catch" when one of them tightens later, and this
 * would have been a third.
 *
 * Deliberately its OWN constant rather than reusing BASE_URL_PROTOCOLS, on the
 * same reasoning lib/slack keeps WEBHOOK_PROTOCOLS separate: these are
 * different domains that happen to agree today. A deployment could sensibly
 * force the admin dashboard URL to https-only without also banning
 * `http://localhost:8545` for a dev RPC node — and sharing one constant would
 * make that tightening break local development silently.
 */
const CHAIN_ENDPOINT_PROTOCOLS = ['https', 'http'] as const

/** `CHAIN_` + the chain id upper-cased with every non-alphanumeric run → `_`. */
export function chainEnvPrefix(id: string): string {
  return `CHAIN_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
}

export function schemaFor(entry: ChainManifestEntry): readonly SecretFieldSpec[] {
  const schema = SECRET_SCHEMA[entry.namespace]
  if (schema === undefined) {
    throw new Error(`no secret schema for namespace '${entry.namespace}' (chain ${entry.id})`)
  }
  return schema
}

/**
 * What a field must contain, in words an operator can act on.
 *
 * The boot error used to name only the variable, so the one person who needs
 * to fix it — someone reading container logs, usually without the source to
 * hand — had to open this file to learn what shape was wanted. Naming the
 * expectation costs nothing and removes that hop.
 */
export function describeKind(kind: SecretKind): string {
  switch (kind) {
    case 'url':
      return `an absolute ${CHAIN_ENDPOINT_PROTOCOLS.join(' or ')} URL`
    case 'evmAddr':
      return '0x followed by 40 hex characters'
    case 'evmKey':
      return '0x followed by 64 hex characters'
    case 'base58':
      return '32 to 44 base58 characters'
    case 'base58Key':
      return `a base58-encoded ${ED25519_SECRET_KEY_BYTES}-byte secret key`
    case 'uint':
      return 'a decimal integer'
    case 'bool':
      return "either 'true' or 'false'"
    case 'str':
      return 'a non-empty value'
  }
}

/** Quote characters an env file or compose entry can leave wrapped around a value. */
const QUOTE_CHARS = new Set(['"', "'", '`'])

/**
 * What ACTUALLY arrived, described without ever reproducing it.
 *
 * These fields are private keys and metered RPC endpoints, so no part of the
 * value may reach a log — not a prefix, not a redacted middle. Length and a
 * few structural facts are enough to separate the causes that matter and give
 * away nothing: an EVM key is publicly 66 characters, so saying "68 characters,
 * wrapped in quotes" identifies the mistake exactly while revealing no key
 * material. Quoting is called out first because `env_file` in Docker Compose
 * does NOT strip quotes, which is the most common way this fails.
 */
export function describeShape(kind: SecretKind, value: string): string {
  const notes = [`${value.length} character${value.length === 1 ? '' : 's'}`]
  const first = value[0]
  if (value.length >= 2 && first !== undefined && QUOTE_CHARS.has(first) && value.endsWith(first)) {
    // Return here rather than fall through. A quoted key also trips "no 0x
    // prefix", which is true of the stored string and useless to an operator
    // looking at an env file where the 0x is plainly visible — it points at
    // the wrong thing. The quotes ARE the bug; say only that.
    notes.push('wrapped in quotes')
    return notes.join(', ')
  }
  // Whitespace SURVIVED the trim in optionalEnv, so any left is internal — a
  // wrapped line or a value pasted with a break in it.
  if (/\s/.test(value)) notes.push('contains whitespace')
  if (kind === 'evmAddr' || kind === 'evmKey') {
    if (!/^0x/i.test(value)) notes.push('no 0x prefix')
    // `0X` is its own cause and must not be reported as the next one down.
    // isValid demands a lowercase x, so an upper-cased key is rejected with 64
    // perfectly good hex digits behind it — telling that operator to hunt for a
    // non-hex character sends them looking at the only part that is correct.
    else if (!value.startsWith('0x')) notes.push('uppercase 0X prefix')
    else if (!/^0x[0-9a-fA-F]*$/.test(value)) notes.push('non-hex characters after 0x')
  }
  if (kind === 'url') {
    // Two distinct URL causes. Missing `//` (`https:rpc.example.com`) parses
    // happily under WHATWG, which is why isValid checks the prefix separately;
    // a well-formed but unusable scheme is the OTHER one, and `ws://` is the
    // one operators actually reach for — isValid's comment says why it cannot
    // work. Left undiagnosed it read as a bare length.
    if (!ABSOLUTE_PREFIX.test(value)) notes.push('no scheme://')
    else {
      const note = urlNote(value)
      if (note !== null) notes.push(note)
    }
  }
  return notes.join(', ')
}

/**
 * Why a value that HAS a `scheme://` still failed, or null when the URL itself
 * is not the problem. Two causes, kept apart because conflating them sends the
 * operator to the wrong place: an unusable scheme (`ws://`, which isValid's
 * comment explains cannot work), and text that does not parse as a URL at all.
 * The scheme is described, never echoed — the value may carry a metered API key.
 */
function urlNote(value: string): string | null {
  try {
    void new URL(value)
  } catch {
    return 'not a parseable URL'
  }
  // The protocol question goes back through isAbsoluteUrl rather than being
  // re-implemented, so the diagnosis can never disagree with the rejection.
  return isAbsoluteUrl(value, CHAIN_ENDPOINT_PROTOCOLS)
    ? null
    : `scheme is not ${CHAIN_ENDPOINT_PROTOCOLS.join(' or ')}`
}

export function isValid(kind: SecretKind, value: string): boolean {
  switch (kind) {
    case 'url':
      // Shared with config.ts and lib/slack — lib/env.ts's rule 2, which this
      // reader had adopted rule 1 (`optionalEnv`) of but not this one. A
      // protocol-only check is NOT enough: `new URL('https:rpc.example.com')`
      // parses happily, protocol `https:`, host `rpc.example.com`, so the
      // missing-slashes typo used to pass boot and fail later at the point of
      // use. `ftp://x.com` used to pass too.
      //
      // http/https only, because that is what every consumer of these three
      // fields can actually speak: EVM rpc_url goes to viem's `http()`
      // transport, Solana's to `new Connection()`, and paymaster_url to
      // `fetch(url, { method: 'POST' })`. A ws:// endpoint would need viem's
      // separate webSocket() transport, so accepting one here would only move
      // the failure to runtime.
      return isAbsoluteUrl(value, CHAIN_ENDPOINT_PROTOCOLS)
    case 'evmAddr':
      return /^0x[0-9a-fA-F]{40}$/.test(value)
    case 'evmKey':
      return /^0x[0-9a-fA-F]{64}$/.test(value)
    case 'base58':
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)
    case 'base58Key':
      // Decoded, not length-matched: base58 length only approximates byte
      // length (63 bytes of 0xff is 87 characters too), and a key of the
      // wrong size would otherwise pass here and crash `Keypair.fromSecretKey`
      // at boot with an error that names nothing.
      return isBase58Bytes(value, ED25519_SECRET_KEY_BYTES)
    case 'uint':
      // Decimal block ordinal; bounded so Number() stays exact (2^53 blocks
      // is far beyond any chain's height).
      return /^\d{1,15}$/.test(value)
    case 'bool':
      // Only the two literals. A typo ('yes', 'True', '1') is a boot error
      // naming the key rather than a silent false — the same reason every other
      // kind here validates instead of coercing, and the #34 lesson that a
      // value which merely LOOKS unset must never read as a decision.
      return value === 'true' || value === 'false'
    case 'str':
      return value.length > 0
  }
}

/** True iff `value` is base58 text that decodes to exactly `bytes` bytes. */
function isBase58Bytes(value: string, bytes: number): boolean {
  try {
    return bs58.decode(value).length === bytes
  } catch {
    return false // not base58 at all
  }
}

/**
 * Every env key the manifest could legitimately read, powers the boot-time
 * typo guard AND the .env.example parity test (documented CHAIN_* names must
 * be names the loader actually reads, so the docs can't silently rot).
 */
export function knownChainEnvKeys(
  manifest: readonly ChainManifestEntry[] = CHAIN_MANIFEST,
): Set<string> {
  const keys = new Set<string>()
  for (const entry of manifest) {
    const prefix = chainEnvPrefix(entry.id)
    for (const spec of schemaFor(entry)) keys.add(`${prefix}_${spec.envSuffix}`)
  }
  return keys
}
