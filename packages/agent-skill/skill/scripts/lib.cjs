'use strict'
/**
 * The skill's helper, as a library: everything the command line does, with the
 * network, the clock and the filesystem passed in, so it is tested in-process.
 *
 * THIS CODE NEVER HOLDS A KEY. It builds the things a wallet must sign (the
 * sign-in message, the 402 terms) and assembles what the wallet's signature
 * goes into (the registration body, the X-PAYMENT header). The signing itself
 * happens in the caller's own wallet or tooling, and the signature comes back
 * in as an argument. There is no private-key flag, no key environment
 * variable and no signing library in this directory, and a test keeps it so.
 *
 * Every route, header name and wire constant is read from generated.json,
 * which the package build derives from the API's own constants. Nothing here
 * spells a path of its own.
 */
const FACTS = require('../generated.json')

const USAGE = [
  'tenda: hire a human through the Tenda agent API. Never signs; you sign.',
  '',
  'Environment: TENDA_API (base URL, no trailing slash), TENDA_TOKEN (bearer).',
  '',
  '  chains                                  what this deployment settles on (testnet/mainnet, faucet, funding by signature)',
  '  auth-message --chain ID --address ADDR  fetch a nonce and print the message YOUR WALLET must sign',
  '  register --chain ID --address ADDR --message FILE|TEXT --signature SIG --name NAME [--country CC]',
  '  validate BODY.json                      check a task body: no draft, no payment, no moderation',
  '  quote BODY.json [--out quote.json]      ask for terms (402): prints what your wallet must sign',
  '  settle --quote quote.json (--signature SIG | --transaction B64)   resend the same body with the payment header',
  '  watch TASK_ID [--interval 15] [--timeout 1800]   poll until the task leaves draft',
].join('\n')

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const name = arg.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) flags[name] = true
      else {
        flags[name] = next
        i++
      }
    } else positional.push(arg)
  }
  return { flags, positional }
}

function apiBase(env, flags) {
  const raw = typeof flags.api === 'string' ? flags.api : env.TENDA_API
  if (typeof raw !== 'string' || raw === '') throw new UsageError('set TENDA_API (or pass --api) to the deployment base URL')
  return raw.replace(/\/+$/, '')
}

class UsageError extends Error {}

function need(flags, name) {
  const value = flags[name]
  if (typeof value !== 'string' || value === '') throw new UsageError(`--${name} is required`)
  return value
}

/** The sign-in message: the published template with the live nonce and this deployment's URL in it. */
function buildAuthMessage(template, values) {
  const table = {
    '{address}': values.address,
    '{chain_id}': values.chain_id,
    '{api_base_url}': values.api_base_url,
    '{nonce}': values.nonce,
    '{issued_at}': values.issued_at,
  }
  let out = template
  for (const [placeholder, value] of Object.entries(table)) {
    if (!out.includes(placeholder)) throw new Error(`the published auth-message template has no ${placeholder}`)
    out = out.split(placeholder).join(value)
  }
  return out
}

/** The X-PAYMENT header value for a saved 402: base64 JSON { x402Version, scheme, network, payload }. */
function buildPaymentHeader(quote, proof) {
  const terms = quote && quote.terms
  if (!terms || !terms.payment) throw new Error('the quote file has no terms.payment: run `quote` first')
  let payload
  if (terms.payment.kind === 'eip155-authorization') {
    if (typeof proof.signature !== 'string' || proof.signature === '') throw new UsageError('--signature (the wallet\'s signature over the typed data) is required for this chain')
    payload = { signature: proof.signature, authorization: terms.payment.typed_data.message }
  } else if (terms.payment.kind === 'solana-transaction') {
    if (typeof proof.transaction !== 'string' || proof.transaction === '') throw new UsageError('--transaction (the base64 transaction your wallet signed) is required for this chain')
    payload = { transaction: proof.transaction }
  } else {
    throw new Error(`unknown payment kind ${JSON.stringify(terms.payment.kind)}: re-read the document, this skill may be out of date`)
  }
  const envelope = { x402Version: FACTS.x402_version, scheme: terms.scheme, network: terms.network, payload }
  return Buffer.from(JSON.stringify(envelope)).toString('base64')
}

function decodeSettlement(header) {
  if (typeof header !== 'string' || header === '') return null
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

/** One line per chain, then its assets: enough to choose a chain_id and asset id without reading the JSON. */
function summariseChains(body) {
  const lines = []
  for (const chain of body.data) {
    lines.push(`${chain.id}  ${chain.network_kind}  relayed_funding_available=${chain.relayed_funding_available}  faucet=${chain.faucet_url ?? 'none'}`)
    for (const asset of chain.assets) {
      lines.push(`    asset ${asset.id}  ${asset.symbol}  funds_by_signature=${asset.funds_by_signature}  roles=${asset.roles.join(',')}`)
    }
  }
  return lines.join('\n')
}

async function call(deps, method, path, options = {}) {
  const base = apiBase(deps.env, options.flags ?? {})
  const headers = { accept: 'application/json', ...(options.headers ?? {}) }
  const token = typeof (options.flags ?? {}).token === 'string' ? options.flags.token : deps.env.TENDA_TOKEN
  if (options.auth !== false && token) headers.authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  const res = await deps.fetch(base + path, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) })
  const text = await res.text()
  let json = null
  try {
    json = text === '' ? null : JSON.parse(text)
  } catch {
    json = null
  }
  return { status: res.status, json, text, header: (name) => res.headers.get(name) }
}

function print(deps, value) {
  deps.stdout(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

/** A non-2xx answer is the ApiError envelope; print it whole and fail, so the code and details are not lost. */
function failure(deps, res) {
  print(deps, { http_status: res.status, ...(res.json ?? { body: res.text }) })
  const retryAfter = res.header('retry-after')
  if (retryAfter) deps.stderr(`rate limited: wait ${retryAfter}s before retrying`)
  return 1
}

function readBody(deps, file) {
  if (typeof file !== 'string') throw new UsageError('pass the task body as a JSON file')
  return JSON.parse(deps.readFile(file))
}

const COMMANDS = {
  async chains(deps, args) {
    const res = await call(deps, 'GET', FACTS.routes.platformChains, { flags: args.flags, auth: false })
    if (res.status !== 200) return failure(deps, res)
    deps.stdout(summariseChains(res.json))
    return 0
  },

  async 'auth-message'(deps, args) {
    const chain_id = need(args.flags, 'chain')
    const address = need(args.flags, 'address')
    const res = await call(deps, 'POST', FACTS.routes.authNonce, { flags: args.flags, auth: false })
    if (res.status !== 200) return failure(deps, res)
    const message = buildAuthMessage(FACTS.auth_message_template, {
      address,
      chain_id,
      api_base_url: apiBase(deps.env, args.flags),
      nonce: res.json.nonce,
      issued_at: res.json.issued_at,
    })
    print(deps, { message, nonce: res.json.nonce, issued_at: res.json.issued_at, expires_in: res.json.expires_in, next: 'sign `message` byte for byte with your wallet (EVM personal_sign), then run `register`' })
    return 0
  },

  async register(deps, args) {
    const message = need(args.flags, 'message')
    const body = {
      chain_id: need(args.flags, 'chain'),
      address: need(args.flags, 'address'),
      message: deps.exists(message) ? deps.readFile(message) : message,
      signature: need(args.flags, 'signature'),
      name: need(args.flags, 'name'),
      ...(typeof args.flags.country === 'string' ? { country: args.flags.country } : {}),
    }
    const res = await call(deps, 'POST', FACTS.routes.agentRegister, { flags: args.flags, auth: false, body })
    if (res.status !== 200) return failure(deps, res)
    print(deps, { token: res.json.token, is_new: res.json.is_new, user: res.json.user, next: 'export TENDA_TOKEN=<token>' })
    return 0
  },

  async validate(deps, args) {
    const res = await call(deps, 'POST', FACTS.routes.agentTasksValidate, { flags: args.flags, body: readBody(deps, args.positional[0]) })
    if (res.status !== 200) return failure(deps, res)
    print(deps, { ...res.json, note: 'ok does NOT mean the listing passed moderation; the real post can still answer CONTENT_MODERATED' })
    return 0
  },

  async quote(deps, args) {
    const body = readBody(deps, args.positional[0])
    const res = await call(deps, 'POST', FACTS.routes.agentTasks, { flags: args.flags, body })
    if (res.status !== 402) return failure(deps, res)
    const terms = res.json.accepts[0]
    const quote = { body, task_id: res.json.task_id, terms }
    if (typeof args.flags.out === 'string') deps.writeFile(args.flags.out, JSON.stringify(quote, null, 2))
    const sign = terms.payment.kind === 'eip155-authorization'
      ? { sign: 'eth_signTypedData_v4 over typed_data, verbatim', typed_data: terms.payment.typed_data }
      : { sign: 'the unsigned transaction, as base64', transaction: terms.payment.transaction }
    print(deps, { task_id: res.json.task_id, expires_at_unix: terms.expires_at_unix, network: terms.network, amount_raw: terms.amount_raw, pay_to: terms.pay_to, ...sign, next: 'sign it with your wallet, then run `settle --quote <file> --signature <sig>`' })
    return 0
  },

  async settle(deps, args) {
    const quote = JSON.parse(deps.readFile(need(args.flags, 'quote')))
    const header = buildPaymentHeader(quote, { signature: args.flags.signature, transaction: args.flags.transaction })
    const res = await call(deps, 'POST', FACTS.routes.agentTasks, { flags: args.flags, body: quote.body, headers: { [FACTS.payment_header]: header } })
    if (res.status !== 201) return failure(deps, res)
    print(deps, { ...res.json, settlement: decodeSettlement(res.header(FACTS.settlement_header)), next: 'run `watch <task_id>` until the task leaves draft' })
    return 0
  },

  async watch(deps, args) {
    const id = args.positional[0]
    if (!id) throw new UsageError('pass the task id')
    const interval = Number(args.flags.interval ?? 15)
    const timeout = Number(args.flags.timeout ?? 1800)
    const path = FACTS.routes.gigGet.replace(':id', encodeURIComponent(id))
    const started = deps.now()
    for (;;) {
      const res = await call(deps, 'GET', path, { flags: args.flags })
      if (res.status !== 200) return failure(deps, res)
      if (res.json.status !== 'draft') {
        print(deps, { task_id: id, status: res.json.status, gig: res.json })
        return 0
      }
      if (deps.now() - started >= timeout * 1000) {
        print(deps, { task_id: id, status: 'draft', timed_out: true, next: 'still a draft past the horizon the document states on the task operation: resend the same body without the payment header for fresh terms' })
        return 2
      }
      await deps.sleep(interval * 1000)
    }
  },
}

async function run(argv, deps) {
  const [command, ...rest] = argv
  if (command === undefined || command === 'help' || command === '--help') {
    deps.stdout(USAGE)
    return command === undefined ? 1 : 0
  }
  const handler = COMMANDS[command]
  if (handler === undefined) {
    deps.stderr(`unknown command ${JSON.stringify(command)}\n\n${USAGE}`)
    return 1
  }
  try {
    return await handler(deps, parseArgs(rest))
  } catch (error) {
    deps.stderr(error instanceof UsageError ? `usage: ${error.message}` : `error: ${error.message}`)
    return 1
  }
}

module.exports = { run, parseArgs, apiBase, buildAuthMessage, buildPaymentHeader, decodeSettlement, summariseChains, USAGE, UsageError }
