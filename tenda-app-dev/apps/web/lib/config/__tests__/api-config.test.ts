/**
 * lib/api-config — the web base-URL seam. What must hold: every env targets
 * the NEXT_PUBLIC_API_URL host, and the timeout/retry budgets still come from
 * @tenda/shared (they must not drift from mobile's).
 */
import { vi } from 'vitest'
import { apiConfig as sharedApiConfig } from '@tenda/shared'
import { apiConfig } from '@/lib/config/api-config'

describe('apiConfig for web', () => {
  it('targets the NEXT_PUBLIC_API_URL host in every env', () => {
    // vitest.config.ts sets NEXT_PUBLIC_API_URL for the suite; the module
    // reads it at load, exactly as the Next bundler inlines it.
    expect(apiConfig.development.baseUrl).toBe('http://localhost:3000')
    expect(apiConfig.staging.baseUrl).toBe('http://localhost:3000')
    expect(apiConfig.production.baseUrl).toBe('http://localhost:3000')
  })

  it('keeps the shared per-env timeout and retry budgets', () => {
    for (const env of ['development', 'staging', 'production'] as const) {
      expect(apiConfig[env].timeout).toBe(sharedApiConfig[env].timeout)
      expect(apiConfig[env].retries).toBe(sharedApiConfig[env].retries)
    }
  })

  it('falls back to empty and complains loudly when NEXT_PUBLIC_API_URL is unset', async () => {
    // Fresh module load with the var stubbed away — mirrors a misconfigured
    // build, which must fail loud (console.error), not as "undefined/v1/...".
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_API_URL', '')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const fresh = await import('@/lib/config/api-config')
      expect(fresh.apiConfig.development.baseUrl).toBe('')
      expect(error).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_API_URL'))
    } finally {
      vi.unstubAllEnvs()
      error.mockRestore()
      vi.resetModules()
    }
  })
})
