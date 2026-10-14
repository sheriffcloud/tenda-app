/**
 * A throwaway JSON-RPC node over a real socket.
 *
 * Used where the thing under test is what the SERVER puts on the wire — the
 * contract set an `eth_getLogs` carries, the receipt an adapter asks for — so a
 * mocked transport would beg the question. Two boot-path suites needed one, and
 * a second hand-rolled copy is how they drift.
 *
 * `close()` destroys live sockets as well as the listener: viem's transport
 * keeps connections alive, and `server.close()` alone waits for them forever,
 * which surfaces as a test file that passes and then hangs the runner.
 *
 * CLOSE IT IN A `finally` (or an `after` hook), never on a test's last line.
 * An assertion that throws before an unguarded close leaves the listener up and
 * node never exits — so a RED test becomes a HUNG GATE, and the failure that
 * tripped it is never reported. Measured: 2m25s on a 5s suite, with no postgres
 * connection open, i.e. nothing to do with the suite lock (#48).
 *
 * The backstop below closes whatever a suite still leaves open, so a slip
 * degrades to a reported failure rather than a hang. It is a net, not a licence:
 * a server held open until the end of the file still blocks nothing but is
 * invisible to the reader.
 */

import { after } from 'node:test'
import { createServer, type Server } from 'node:http'
import { resetChainSecretsCache } from '@server/chains/secrets'

export interface StubRpcCall {
  method: string
  params: unknown[]
}

export interface StubRpc {
  url: string
  /** Every JSON-RPC call received, in order. */
  calls: StubRpcCall[]
  /** Calls for one method — the usual assertion target. */
  callsTo(method: string): StubRpcCall[]
  close(): Promise<void>
}

/**
 * Every stub still listening. The module-level `after` below drains it, which is
 * what turns a forgotten close from a hung runner into an ordinary failure.
 */
const live = new Set<Server>()

after(async () => {
  for (const server of live) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  live.clear()
})

/**
 * @param respond maps a JSON-RPC method to its `result`. Returning `undefined`
 *   answers `null`, which is what an EVM node returns for an unknown receipt —
 *   so an unhandled method degrades the way the real thing does rather than
 *   erroring in a way no production code has to handle. May return a Promise:
 *   a responder that resolves late is how a timeout test gets a slow node.
 *
 *   THROWING answers HTTP 500 with a JSON-RPC error — a node that is up and
 *   failing, which is the shape a failover test needs. Returning a bad `result`
 *   is not a substitute: viem's `fallback` transport only fails over on
 *   TRANSPORT errors, so a 200 carrying nonsense fails inside the client with
 *   the second endpoint never tried. The request is still recorded in `calls`,
 *   which is what lets a test prove the primary was attempted exactly once.
 */
export async function startStubRpc(
  respond: (method: string, params: unknown[]) => unknown,
): Promise<StubRpc> {
  const calls: StubRpcCall[] = []

  const server: Server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += String(chunk)))
    req.on('end', async () => {
      const parsed = JSON.parse(body) as { id: number; method: string; params?: unknown[] }
      const params = parsed.params ?? []
      calls.push({ method: parsed.method, params })
      res.setHeader('content-type', 'application/json')
      try {
        const result = (await respond(parsed.method, params)) ?? null
        res.end(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result }))
      } catch (err) {
        res.statusCode = 500
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: parsed.id,
            error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
          }),
        )
      }
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  live.add(server)
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0

  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    callsTo: (method) => calls.filter((c) => c.method === method),
    async close() {
      live.delete(server)
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

/**
 * Run `body` with the chain secrets pointing at ONE EVM chain on `rpcUrl`, then
 * restore the environment exactly.
 *
 * The restore is the point. `getChainSecrets()` caches, and the loader reads
 * `process.env` directly, so a suite that sets `CHAIN_*` and forgets to unset it
 * changes what every LATER file in the same worker sees — a failure that lands
 * somewhere else entirely and looks unrelated. Both boot suites need this, and
 * two hand-rolled copies is how one of them ends up missing a key.
 */
export async function withEvmChainEnv(
  args: {
    chainEnvPrefix: string
    rpcUrl: string
    escrow: string
    treasury: string
    /**
     * Further CHAIN_* vars, keyed by their FULL name. For optional secrets a
     * suite wants the loader to see — a relayer key, the #43 sweep flag — which
     * the three required ones above cannot express. Cleared and restored with
     * the rest.
     */
    extraEnv?: Record<string, string>
  },
  body: () => Promise<void>,
): Promise<void> {
  const saved = { ...process.env }
  const clearChainEnv = (): void => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CHAIN_')) delete process.env[key]
    }
  }

  clearChainEnv()
  process.env[`${args.chainEnvPrefix}_RPC_URL`] = args.rpcUrl
  process.env[`${args.chainEnvPrefix}_ESCROW_ADDR`] = args.escrow
  process.env[`${args.chainEnvPrefix}_TREASURY_ADDR`] = args.treasury
  for (const [key, value] of Object.entries(args.extraEnv ?? {})) process.env[key] = value
  resetChainSecretsCache()

  try {
    await body()
  } finally {
    clearChainEnv()
    Object.assign(process.env, saved)
    resetChainSecretsCache()
  }
}
