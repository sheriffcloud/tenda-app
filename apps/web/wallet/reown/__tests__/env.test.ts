/**
 * Reown env parsing: disabled without a project id, loud on a half-set
 * configuration, origin-normalized when valid (ported behavior from
 * apps/admin — same contract, web env names).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseReownEnvironment, reownEnvironment } from '@/wallet/reown/env'

afterEach(() => vi.unstubAllEnvs())

describe('parseReownEnvironment', () => {
  it('is disabled when the project id is unset or blank', () => {
    expect(parseReownEnvironment(undefined, 'https://app.tendahq.com')).toEqual({ enabled: false })
    expect(parseReownEnvironment('   ', 'https://app.tendahq.com')).toEqual({ enabled: false })
  })

  it('throws when the project id is set but the web URL is missing', () => {
    expect(() => parseReownEnvironment('pid', undefined)).toThrow(/NEXT_PUBLIC_WEB_URL is required/)
    expect(() => parseReownEnvironment('pid', '  ')).toThrow(/NEXT_PUBLIC_WEB_URL is required/)
  })

  it('throws on a relative or non-http(s) web URL', () => {
    expect(() => parseReownEnvironment('pid', '/app')).toThrow(/absolute http\(s\) URL/)
    expect(() => parseReownEnvironment('pid', 'ftp://tendahq.com')).toThrow(/absolute http\(s\) URL/)
  })

  it('normalizes to the ORIGIN — path/query are not application identity', () => {
    expect(parseReownEnvironment(' pid ', 'https://app.tendahq.com/gigs?x=1')).toEqual({
      enabled: true,
      projectId: 'pid',
      webUrl: 'https://app.tendahq.com',
    })
  })
})

describe('reownEnvironment', () => {
  it('reads the inlined build env', () => {
    vi.stubEnv('NEXT_PUBLIC_REOWN_PROJECT_ID', 'pid-env')
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'http://localhost:3200')
    expect(reownEnvironment()).toEqual({ enabled: true, projectId: 'pid-env', webUrl: 'http://localhost:3200' })
  })

  it('is disabled when the project id env is absent', () => {
    vi.stubEnv('NEXT_PUBLIC_REOWN_PROJECT_ID', '')
    expect(reownEnvironment()).toEqual({ enabled: false })
  })
})
