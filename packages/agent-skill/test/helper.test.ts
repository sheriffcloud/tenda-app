/**
 * The helper, in-process: network, clock and filesystem are injected. What is
 * pinned is that it builds what a wallet must sign and assembles what the
 * signature goes into — and that it can do neither of those with a key.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { X402_VERSION, buildAuthMessage, type RelayPaymentPayload } from '@tenda/shared'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lib = require('../skill/scripts/lib.cjs') as typeof import('../skill/scripts/lib.cjs')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FACTS = require('../skill/generated.json') as { routes: Record<string, string>; payment_header: string; settlement_header: string; auth_message_template: string }

interface Call { method: string; url: string; headers: Record<string, string>; body: unknown }
type Reply = { status: number; json?: unknown; headers?: Record<string, string>; text?: string }

function harness(replies: Reply[], env: Record<string, string | undefined> = { TENDA_API: 'https://api.example/', TENDA_TOKEN: 'tok' }, files: Record<string, string> = {}) {
  const calls: Call[] = []
  const out: string[] = []
  const err: string[] = []
  const written: Record<string, string> = {}
  let clock = 0
  const sleeps: number[] = []
  const deps = {
    env,
    fetch: async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
      calls.push({ method: init.method, url, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body) })
      const reply = replies.shift()
      assert.ok(reply !== undefined, `unexpected request ${init.method} ${url}`)
      const text = reply.text ?? (reply.json === undefined ? '' : JSON.stringify(reply.json))
      return { status: reply.status, text: async () => text, headers: { get: (name: string) => reply.headers?.[name.toLowerCase()] ?? null } }
    },
    stdout: (t: string) => out.push(t),
    stderr: (t: string) => err.push(t),
    readFile: (f: string) => {
      assert.ok(f in files, `read of unexpected file ${f}`)
      return files[f]
    },
    writeFile: (f: string, t: string) => { written[f] = t },
    exists: (f: string) => f in files,
    now: () => clock,
    sleep: async (ms: number) => { sleeps.push(ms); clock += ms },
  }
  return { deps, calls, out, err, written, sleeps }
}

const EVM_TERMS = {
  scheme: 'tenda-escrow-create', network: 'eip155:84532', asset: '0xtoken', asset_id: 'usdc', amount_raw: '1000000', pay_to: '0xescrow',
  escrow_id: 'task-1', max_timeout_seconds: 300, expires_at_unix: 1900000000,
  payment: {
    kind: 'eip155-authorization', creator: '0xme', create_params: {},
    typed_data: { primaryType: 'ReceiveWithAuthorization', message: { from: '0xme', to: '0xescrow', value: '1000000', validAfter: '0', validBefore: '1900000000', nonce: '0x33' } },
  },
}
const SOL_TERMS = { ...EVM_TERMS, network: 'solana:devnet', payment: { kind: 'solana-transaction', creator: 'me', fee_payer: 'fp', transaction: 'dW5zaWduZWQ=', recent_blockhash: 'h', last_valid_block_height: 1 } }

test('parseArgs: flags take a value, a trailing or doubled flag is a switch, the rest are positionals', () => {
  assert.deepEqual(lib.parseArgs(['file.json', '--out', 'q.json', '--force', '--x', '--y', '1']), {
    flags: { out: 'q.json', force: true, x: true, y: '1' },
    positional: ['file.json'],
  })
})

test('buildAuthMessage fills every placeholder and equals the shared builder byte for byte', () => {
  const issued_at = new Date('2026-10-05T10:00:00.000Z')
  const message = lib.buildAuthMessage(FACTS.auth_message_template, { address: '0xabc', chain_id: 'eip155:1', api_base_url: 'https://api.example', nonce: 'N', issued_at: issued_at.toISOString() })
  assert.equal(message, buildAuthMessage({ address: '0xabc', chain_id: 'eip155:1', uri: 'https://api.example', nonce: 'N', issued_at }))
  assert.throws(() => lib.buildAuthMessage('no placeholders here', { address: 'a', chain_id: 'c', api_base_url: 'u', nonce: 'n', issued_at: 'i' }), /has no \{address\}/)
})

test('apiBase trims trailing slashes, prefers --api, and refuses to guess a deployment', () => {
  assert.equal(lib.apiBase({ TENDA_API: 'https://a.example///' }, {}), 'https://a.example')
  assert.equal(lib.apiBase({ TENDA_API: 'https://a.example' }, { api: 'https://b.example/' }), 'https://b.example')
  assert.throws(() => lib.apiBase({}, {}), /TENDA_API/)
})

test('EVM payment header: base64 { x402Version, scheme, network, payload { signature, authorization } } from the terms verbatim', () => {
  const header = lib.buildPaymentHeader({ terms: EVM_TERMS }, { signature: '0xsig' })
  const decoded: RelayPaymentPayload = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
  assert.deepEqual(decoded, { x402Version: X402_VERSION, scheme: 'tenda-escrow-create', network: 'eip155:84532', payload: { signature: '0xsig', authorization: EVM_TERMS.payment.typed_data.message } })
})

test('Solana payment header carries the signed transaction; a missing proof, a missing quote and an unknown kind are refused', () => {
  const decoded = JSON.parse(Buffer.from(lib.buildPaymentHeader({ terms: SOL_TERMS }, { transaction: 'c2lnbmVk' }), 'base64').toString('utf8'))
  assert.deepEqual(decoded.payload, { transaction: 'c2lnbmVk' })
  assert.throws(() => lib.buildPaymentHeader({ terms: EVM_TERMS }, {}), /--signature/)
  assert.throws(() => lib.buildPaymentHeader({ terms: SOL_TERMS }, {}), /--transaction/)
  assert.throws(() => lib.buildPaymentHeader({}, { signature: 's' }), /run `quote` first/)
  assert.throws(() => lib.buildPaymentHeader({ terms: { ...EVM_TERMS, payment: { kind: 'new-kind' } } }, { signature: 's' }), /unknown payment kind/)
})

test('decodeSettlement reads the receipt header and never throws on garbage', () => {
  const receipt = { success: true, transaction: '0xtx', network: 'eip155:1', payer: '0xme' }
  assert.deepEqual(lib.decodeSettlement(Buffer.from(JSON.stringify(receipt)).toString('base64')), receipt)
  assert.equal(lib.decodeSettlement('%%%not base64 json%%%'), null)
  assert.equal(lib.decodeSettlement(null), null)
  assert.equal(lib.decodeSettlement(''), null)
})

test('summariseChains: one line per chain, then its assets, with testnet/mainnet and faucet visible', () => {
  const text = lib.summariseChains({ data: [
    { id: 'eip155:84532', network_kind: 'testnet', relayed_funding_available: true, faucet_url: 'https://faucet', assets: [{ id: 'usdc', symbol: 'USDC', funds_by_signature: true, roles: ['gig', 'exchange'] }] },
    { id: 'eip155:42220', network_kind: 'mainnet', relayed_funding_available: false, faucet_url: null, assets: [] },
  ] })
  assert.match(text, /^eip155:84532 {2}testnet {2}relayed_funding_available=true {2}faucet=https:\/\/faucet$/m)
  assert.match(text, /^ {4}asset usdc {2}USDC {2}funds_by_signature=true {2}roles=gig,exchange$/m)
  assert.match(text, /^eip155:42220 {2}mainnet {2}relayed_funding_available=false {2}faucet=none$/m)
})

test('auth-message: asks for a nonce with no bearer, and prints the message built from the published template', async () => {
  const h = harness([{ status: 200, json: { nonce: 'NONCE1', issued_at: '2026-10-05T10:00:00.000Z', expires_in: 300 } }])
  assert.equal(await lib.run(['auth-message', '--chain', 'eip155:84532', '--address', '0xme'], h.deps), 0)
  assert.equal(h.calls[0].url, `https://api.example${FACTS.routes.authNonce}`)
  assert.equal(h.calls[0].headers.authorization, undefined, 'the nonce is anonymous')
  const printed = JSON.parse(h.out[0])
  assert.equal(printed.message, buildAuthMessage({ address: '0xme', chain_id: 'eip155:84532', uri: 'https://api.example', nonce: 'NONCE1', issued_at: new Date('2026-10-05T10:00:00.000Z') }))
})

test('register: sends the wallet proof (the message may be a file), no bearer, and prints the token', async () => {
  const h = harness([{ status: 200, json: { token: 'NEW', is_new: true, user: { id: 'u' } } }], undefined, { 'msg.txt': 'the signed message' })
  assert.equal(await lib.run(['register', '--chain', 'eip155:1', '--address', '0xme', '--message', 'msg.txt', '--signature', '0xs', '--name', 'Bot', '--country', 'NG'], h.deps), 0)
  assert.deepEqual(h.calls[0].body, { chain_id: 'eip155:1', address: '0xme', message: 'the signed message', signature: '0xs', name: 'Bot', country: 'NG' })
  assert.equal(h.calls[0].headers.authorization, undefined)
  assert.equal(JSON.parse(h.out[0]).token, 'NEW')
})

test('register with the message inline and no country sends exactly the required fields', async () => {
  const h = harness([{ status: 200, json: { token: 'T', is_new: false, user: {} } }])
  await lib.run(['register', '--chain', 'c', '--address', 'a', '--message', 'inline text', '--signature', 's', '--name', 'N'], h.deps)
  assert.deepEqual(Object.keys(h.calls[0].body as object).sort(), ['address', 'chain_id', 'message', 'name', 'signature'])
  assert.equal((h.calls[0].body as { message: string }).message, 'inline text')
})

test('quote saves the quote and prints what the wallet must sign; an EVM quote prints the typed data, a Solana one the transaction', async () => {
  const body = { title: 't' }
  const evm = harness([{ status: 402, json: { accepts: [EVM_TERMS], task_id: 'task-1' } }], undefined, { 'task.json': JSON.stringify(body) })
  assert.equal(await lib.run(['quote', 'task.json', '--out', 'quote.json'], evm.deps), 0)
  assert.equal(evm.calls[0].url, `https://api.example${FACTS.routes.agentTasks}`)
  assert.equal(evm.calls[0].headers.authorization, 'Bearer tok')
  assert.deepEqual(JSON.parse(evm.written['quote.json']), { body, task_id: 'task-1', terms: EVM_TERMS })
  assert.deepEqual(JSON.parse(evm.out[0]).typed_data, EVM_TERMS.payment.typed_data)
  const sol = harness([{ status: 402, json: { accepts: [SOL_TERMS], task_id: 'task-2' } }], undefined, { 'task.json': '{}' })
  await lib.run(['quote', 'task.json'], sol.deps)
  assert.equal(JSON.parse(sol.out[0]).transaction, 'dW5zaWduZWQ=')
  assert.deepEqual(sol.written, {}, 'no --out, no file')
})

test('settle resends the SAME body with the payment header and prints the decoded receipt', async () => {
  const body = { title: 't', creation_operation_id: 'op' }
  const receipt = { success: true, transaction: '0xtx', network: 'eip155:84532', payer: '0xme' }
  const h = harness(
    [{ status: 201, json: { task_id: 'task-1', tx_ref: '0xtx', status: 'draft' }, headers: { [FACTS.settlement_header]: Buffer.from(JSON.stringify(receipt)).toString('base64') } }],
    undefined,
    { 'quote.json': JSON.stringify({ body, task_id: 'task-1', terms: EVM_TERMS }) },
  )
  assert.equal(await lib.run(['settle', '--quote', 'quote.json', '--signature', '0xsig'], h.deps), 0)
  assert.deepEqual(h.calls[0].body, body)
  assert.equal(h.calls[0].headers[FACTS.payment_header], lib.buildPaymentHeader({ terms: EVM_TERMS }, { signature: '0xsig' }))
  assert.deepEqual(JSON.parse(h.out[0]).settlement, receipt)
})

test('validate posts the body to the validate route and says ok is not cleared', async () => {
  const h = harness([{ status: 200, json: { ok: true, moderation: 'not_run' } }], undefined, { 'task.json': '{"title":"t"}' })
  assert.equal(await lib.run(['validate', 'task.json'], h.deps), 0)
  assert.equal(h.calls[0].url, `https://api.example${FACTS.routes.agentTasksValidate}`)
  assert.match(JSON.parse(h.out[0]).note, /does NOT mean the listing passed moderation/)
})

test('watch polls until the task leaves draft, sleeping the interval between reads', async () => {
  const h = harness([{ status: 200, json: { status: 'draft' } }, { status: 200, json: { status: 'draft' } }, { status: 200, json: { status: 'open' } }])
  assert.equal(await lib.run(['watch', 'task-1', '--interval', '5'], h.deps), 0)
  assert.equal(h.calls.length, 3)
  assert.equal(h.calls[0].url, `https://api.example${FACTS.routes.gigGet.replace(':id', 'task-1')}`)
  assert.deepEqual(h.sleeps, [5000, 5000])
  assert.equal(JSON.parse(h.out[0]).status, 'open')
})

test('watch gives up at its timeout with exit 2 and tells the caller to resend for fresh terms', async () => {
  const h = harness([{ status: 200, json: { status: 'draft' } }, { status: 200, json: { status: 'draft' } }, { status: 200, json: { status: 'draft' } }])
  assert.equal(await lib.run(['watch', 'task-1', '--interval', '10', '--timeout', '15'], h.deps), 2)
  assert.equal(JSON.parse(h.out[0]).timed_out, true)
})

test('watch with no task id is a usage error, not a request for "undefined"', async () => {
  const h = harness([])
  assert.equal(await lib.run(['watch'], h.deps), 1)
  assert.match(h.err[0], /usage: pass the task id/)
  assert.equal(h.calls.length, 0)
})

test('watch defaults: 15 seconds between reads, and a 30 minute horizon', async () => {
  // Defaults are what an agent gets when it passes neither flag, and the skill's
  // prose states them; a silent change would make `watch` poll a different way
  // than the document promises.
  const drafts = (n: number): Reply[] => Array.from({ length: n }, () => ({ status: 200, json: { status: 'draft' } }))
  const h = harness([...drafts(2), { status: 200, json: { status: 'open' } }])
  assert.equal(await lib.run(['watch', 'task-1'], h.deps), 0)
  assert.deepEqual(h.sleeps, [15_000, 15_000])

  // 1800s / 15s = 120 sleeps; the read AFTER the 120th sleep is at exactly the horizon and gives up.
  const long = harness(drafts(130))
  assert.equal(await lib.run(['watch', 'task-1'], long.deps), 2)
  assert.equal(long.sleeps.length, 120)
  assert.equal(long.calls.length, 121)
})

test('watch gives up AT the horizon, not one read after it', async () => {
  // interval == timeout: after one sleep the clock sits exactly on the horizon.
  const h = harness([{ status: 200, json: { status: 'draft' } }, { status: 200, json: { status: 'draft' } }, { status: 200, json: { status: 'draft' } }])
  assert.equal(await lib.run(['watch', 'task-1', '--interval', '10', '--timeout', '10'], h.deps), 2)
  assert.equal(h.calls.length, 2)
})

test('watch encodes the task id into the path', async () => {
  const h = harness([{ status: 200, json: { status: 'open' } }])
  await lib.run(['watch', 'a/b c'], h.deps)
  assert.equal(h.calls[0].url, `https://api.example${FACTS.routes.gigGet.replace(':id', 'a%2Fb%20c')}`)
})

test('a --token flag beats TENDA_TOKEN, and either reaches the request as a bearer', async () => {
  const flagged = harness([{ status: 200, json: { ok: true, moderation: 'not_run' } }], { TENDA_API: 'https://api.example', TENDA_TOKEN: 'from-env' }, { 'task.json': '{}' })
  await lib.run(['validate', 'task.json', '--token', 'from-flag'], flagged.deps)
  assert.equal(flagged.calls[0].headers.authorization, 'Bearer from-flag')
  const fromEnv = harness([{ status: 200, json: { ok: true, moderation: 'not_run' } }], { TENDA_API: 'https://api.example', TENDA_TOKEN: 'from-env' }, { 'task.json': '{}' })
  await lib.run(['validate', 'task.json'], fromEnv.deps)
  assert.equal(fromEnv.calls[0].headers.authorization, 'Bearer from-env')
})

test('a non-2xx answer prints the ApiError envelope whole, with the status, and a 429 says how long to wait', async () => {
  const envelope = { statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED', details: { retry_after: 12 } }
  const h = harness([{ status: 429, json: envelope, headers: { 'retry-after': '12' } }], undefined, { 'task.json': '{}' })
  assert.equal(await lib.run(['quote', 'task.json'], h.deps), 1)
  assert.deepEqual(JSON.parse(h.out[0]), { http_status: 429, ...envelope })
  assert.match(h.err[0], /wait 12s/)
  const plain = harness([{ status: 502, text: '<html>bad gateway</html>' }])
  assert.equal(await lib.run(['chains'], plain.deps), 1)
  assert.equal(JSON.parse(plain.out[0]).body, '<html>bad gateway</html>')
})

test('chains is anonymous and prints the summary', async () => {
  const h = harness([{ status: 200, json: { data: [{ id: 'eip155:1', network_kind: 'mainnet', relayed_funding_available: true, faucet_url: null, assets: [] }] } }])
  assert.equal(await lib.run(['chains'], h.deps), 0)
  assert.equal(h.calls[0].headers.authorization, undefined)
  assert.match(h.out[0], /mainnet/)
})

test('usage problems exit 1 with a usage line, never a stack: no command, unknown command, missing flags, no base URL', async () => {
  const none = harness([])
  assert.equal(await lib.run([], none.deps), 1)
  assert.equal(await lib.run(['--help'], none.deps), 0)
  assert.equal(await lib.run(['help'], none.deps), 0)
  assert.equal(await lib.run(['bogus'], none.deps), 1)
  assert.match(none.err[0], /unknown command "bogus"/)
  assert.equal(await lib.run(['register', '--chain', 'c'], none.deps), 1)
  assert.match(none.err[1], /^usage: --message is required/)
  assert.equal(await lib.run(['watch'], none.deps), 1)
  assert.equal(await lib.run(['validate'], none.deps), 1)
  const noBase = harness([], {})
  assert.equal(await lib.run(['chains'], noBase.deps), 1)
  assert.match(noBase.err[0], /TENDA_API/)
  const broken = harness([], undefined, { 'q.json': '{}' })
  assert.equal(await lib.run(['settle', '--quote', 'q.json', '--signature', 's'], broken.deps), 1)
  assert.match(broken.err[0], /^error: /)
})

test('the helper never holds a key: no signing library, key flag or key variable in the code it ships', () => {
  const dir = join(__dirname, '..', 'skill', 'scripts')
  for (const file of readdirSync(dir)) {
    const code = readFileSync(join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const forbidden of [/privateKey/i, /private[_-]?key/i, /mnemonic/i, /secret/i, /AGENT_KEY/, /require\(['"](viem|ethers|@solana|tweetnacl|noble)/, /\bsign(Message|TypedData\w*|Transaction)\s*\(/, /\.sign\(/]) {
      assert.ok(!forbidden.test(code), `${file} matches ${forbidden}`)
    }
  }
})
