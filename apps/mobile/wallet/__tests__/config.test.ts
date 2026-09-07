/**
 * Chain-config single-source matrix (Stage 1). Proves WALLET_CHAINS +
 * SOLANA_NETWORK derive correctly from the build env, and guards the bug this
 * stage fixed: the Solana id must be the server-registry CAIP form
 * (`solana:devnet` / `solana:mainnet`), NEVER the hardcoded genesis-hash form.
 */
type AppEnv = 'development' | 'staging' | 'production'
type ConfigModule = typeof import('../config')

function loadConfig(env: AppEnv): ConfigModule {
  jest.resetModules()
  jest.doMock('@/lib/env', () => ({ getEnv: () => env }))
  return require('../config') as ConfigModule
}

describe('wallet/config, env-derived chain config', () => {
  const cases: ReadonlyArray<{
    env: AppEnv
    network: string
    solana: string
    eip155: string
  }> = [
    { env: 'development', network: 'devnet', solana: 'solana:devnet', eip155: 'eip155:84532' },
    { env: 'staging', network: 'devnet', solana: 'solana:devnet', eip155: 'eip155:84532' },
    { env: 'production', network: 'mainnet-beta', solana: 'solana:mainnet', eip155: 'eip155:8453' },
  ]

  for (const c of cases) {
    it(`${c.env}: SOLANA_NETWORK=${c.network}, solana=${c.solana}, eip155=${c.eip155}`, () => {
      const { SOLANA_NETWORK, WALLET_CHAINS } = loadConfig(c.env)
      expect(SOLANA_NETWORK).toBe(c.network)
      expect(WALLET_CHAINS.solana).toBe(c.solana)
      expect(WALLET_CHAINS.eip155).toBe(c.eip155)
    })
  }

  it('NEVER emits the legacy genesis-hash Solana id (the Stage-1 bug)', () => {
    for (const env of ['development', 'staging', 'production'] as const) {
      const { WALLET_CHAINS } = loadConfig(env)
      expect(WALLET_CHAINS.solana).not.toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')
      expect(WALLET_CHAINS.solana.startsWith('solana:')).toBe(true)
    }
  })

  it('dev/staging share one devnet config; production diverges to mainnet', () => {
    const dev = loadConfig('development')
    const staging = loadConfig('staging')
    const prod = loadConfig('production')
    expect(dev.WALLET_CHAINS).toEqual(staging.WALLET_CHAINS)
    expect(prod.WALLET_CHAINS.solana).not.toBe(dev.WALLET_CHAINS.solana)
    expect(prod.WALLET_CHAINS.eip155).not.toBe(dev.WALLET_CHAINS.eip155)
  })
})
