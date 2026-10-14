/**
 * THE rule that makes chains/rpc a seam rather than a suggestion: no feature
 * builds its own chain client.
 *
 * A source scan, because the thing that goes wrong compiles, runs and passes
 * every behavioural test. That is not hypothetical — it is the measured history
 * this module was extracted from. Five production sites each built their own
 * `new Connection`, with THREE different failover policies between them:
 * the read seam failed over, the Solana relayer passed `has_fallback: false`
 * outright, and the gas-seed funder hand-rolled a try/catch. Nothing failed.
 * The only symptom was a low-balance monitor going quiet on a chain whose
 * fallback was configured and ignored, which looks exactly like a healthy
 * wallet.
 *
 * So the invariant is structural, and it is checked structurally.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripComments, tsFilesUnder } from '../helpers/source-scan'

const SRC = join(__dirname, '../../src')

/**
 * One-off operator scripts are OUT of scope, deliberately. They are run by hand
 * against one endpoint to verify a deploy, they are not the server, and holding
 * them to the server's redundancy rule would be noise that trains people to
 * add exemptions.
 */
const EXCLUDED_PREFIX = 'scripts/'

/** Where a given construction is allowed to appear. */
const RULES: Array<{ what: string; pattern: RegExp; allowed: string }> = [
  {
    what: 'a Solana Connection',
    pattern: /\bnew Connection\s*\(/,
    allowed: 'chains/rpc/solana.ts',
  },
  {
    what: 'a viem transport',
    // `http(` and `fallback([` are the two transport constructors. Client
    // construction (createPublicClient/createWalletClient) is NOT restricted:
    // a caller legitimately needs its own account, chain and cacheTime — what
    // must be central is the TRANSPORT, because that is where failover lives.
    pattern: /(^|[^.\w])(http|fallback)\s*\(\s*[[`'"]/,
    allowed: 'chains/rpc/evm.ts',
  },
]

for (const rule of RULES) {
  test(`${rule.what} is constructed only in ${rule.allowed}`, () => {
    const offenders = tsFilesUnder(SRC)
      .map((file) => ({ rel: relative(SRC, file).replace(/\\/g, '/'), file }))
      .filter(({ rel }) => !rel.startsWith(EXCLUDED_PREFIX) && rel !== rule.allowed)
      .filter(({ file }) => rule.pattern.test(stripComments(readFileSync(file, 'utf8'))))
      .map(({ rel }) => rel)

    assert.deepStrictEqual(
      offenders,
      [],
      `${rule.what} must come from ${rule.allowed} — see chains/rpc. Offenders: ${offenders.join(', ')}`,
    )
  })
}

test('the seam itself still constructs both, so the rules above guard something', () => {
  // Without this, deleting the factories would make every rule above pass by
  // there being nothing left to find — a green suite over a server that can no
  // longer talk to a chain.
  for (const rule of RULES) {
    const source = stripComments(readFileSync(join(SRC, rule.allowed), 'utf8'))
    assert.ok(rule.pattern.test(source), `${rule.allowed} no longer constructs ${rule.what}`)
  }
})
