/**
 * Print the PUBLIC address for a private key held in the environment.
 *
 *   pnpm --filter tenda-server wallet:address E2E_AGENT_KEY
 *   pnpm --filter tenda-server wallet:address E2E_AGENT_KEY E2E_WORKER_KEY
 *   pnpm --filter tenda-server wallet:address --all
 *
 * TAKES THE VARIABLE NAME, NEVER THE KEY. A key passed as an argument is
 * visible to every process on the box via `ps`, lands in shell history, and
 * ends up in CI logs — so this reads `process.env[name]` and the secret never
 * crosses a command line. Nothing here prints key material under any input,
 * including on the error paths.
 *
 * Both namespaces, because the two are not interchangeable and guessing wrong
 * wastes a funding round trip: a 0x-prefixed 32-byte hex key is eip155, a
 * base58 64-byte secret is solana.
 *
 * The two derivations call viem and web3.js DIRECTLY rather than reusing
 * `evmGasSeedAddressFromKey` / `gasSeedAddressFromSecret`. Those are the right
 * definitions for the gas seed, but they sit behind a feature barrel whose
 * shape differs across branches — only one of the pair is exported on `dev`,
 * and a module-boundary guard on the gas-seed branch forbids `src/` reaching
 * past that barrel. A diagnostic utility should not be coupled to a feature
 * being restructured. What is duplicated here is a one-line cryptographic
 * primitive, not a decision: there is no policy to drift.
 */

import 'dotenv/config'
import { privateKeyToAccount } from 'viem/accounts'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

/** What a key looks like, decided by shape rather than by the variable's name. */
type Namespace = 'eip155' | 'solana'

const EVM_KEY = /^0x[0-9a-fA-F]{64}$/

/**
 * Which chain family this secret belongs to.
 *
 * Shape, not naming convention: `CHAIN_SOLANA_DEVNET_RELAYER_KEY` and
 * `CHAIN_EIP155_16661_RELAYER_KEY` both end in `_KEY`, and a rule based on the
 * name would mis-read any variable that did not follow it.
 */
function namespaceOf(secret: string): Namespace {
  return EVM_KEY.test(secret) ? 'eip155' : 'solana'
}

function addressOf(secret: string): { namespace: Namespace; address: string } {
  const namespace = namespaceOf(secret)
  return {
    namespace,
    address:
      namespace === 'eip155'
        ? privateKeyToAccount(secret as `0x${string}`).address
        : Keypair.fromSecretKey(bs58.decode(secret)).publicKey.toBase58(),
  }
}

/**
 * Every environment variable that looks like it holds a signing key.
 *
 * `--all` exists for the question this script is usually asked: "which wallet
 * is the e2e one?" Listing them together answers it in one pass instead of
 * guessing a name at a time.
 */
function keyVarNames(): string[] {
  return Object.keys(process.env)
    .filter((name) => /_KEY$/.test(name) || /^E2E_[A-Z_]*KEY$/.test(name))
    .sort()
}

interface Row {
  name: string
  namespace: Namespace | null
  address: string
  note: string
}

function resolve(name: string): Row {
  const secret = process.env[name]
  if (secret === undefined || secret === '') {
    return { name, namespace: null, address: '—', note: 'not set' }
  }
  try {
    const { namespace, address } = addressOf(secret)
    return { name, namespace, address, note: '' }
  } catch {
    // Deliberately swallowing the cause: a malformed-key error from viem or
    // bs58 can quote the input, and the input is the secret.
    return { name, namespace: null, address: '—', note: 'unreadable (malformed key)' }
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const names = args.includes('--all') ? keyVarNames() : args

  if (names.length === 0) {
    console.error('usage: wallet:address <ENV_VAR_NAME> [...] | --all')
    process.exitCode = 1
    return
  }

  const rows = names.map(resolve)
  const width = Math.max(...rows.map((r) => r.name.length))
  for (const r of rows) {
    const ns = r.namespace === null ? '      ' : r.namespace.padEnd(6)
    console.log(`${r.name.padEnd(width)}  ${ns}  ${r.address}${r.note ? `  (${r.note})` : ''}`)
  }

  // A named variable that is missing is a failure worth an exit code — it is
  // usually a typo, and a silent "—" in a funding runbook is how the wrong
  // wallet gets topped up. `--all` is a survey, so it never fails.
  if (!args.includes('--all') && rows.some((r) => r.note !== '')) process.exitCode = 1
}

// Only when run directly — the convention `verify-gas-seed` uses, so importing
// this module from a test cannot execute it.
if (require.main === module) main()

export { addressOf, namespaceOf, keyVarNames }
