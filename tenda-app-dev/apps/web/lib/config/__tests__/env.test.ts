/**
 * lib/env — NEXT_PUBLIC_APP_ENV → AppEnv mapping. The dangerous edge is a
 * production build with no explicit APP_ENV silently targeting the dev API;
 * that falls back to 'development' but must complain loudly.
 *
 * THE RULE ABOVE WAS ALREADY WRITTEN HERE and the code was WIDER than it
 * (#127): the early return covered only staging and production, so an
 * explicitly-set `development` fell through to a console.error announcing it
 * was "not set". The e2e suite sets exactly that — a production build against
 * the stub API — so every e2e build shipped a false error, which surfaced as
 * an intermittent failure of public-discovery.spec.ts's no-console-errors
 * assertion from #27 onward.
 *
 * The three cases at the bottom are the ones that hole needed: an explicit
 * 'development' is SILENT, an absent one still complains, and an unrecognised
 * one complains DIFFERENTLY — because "you set nothing" and "you set a typo"
 * are different mistakes and the console is where an operator finds out which.
 */
import { afterEach, vi } from 'vitest'
import { getEnv } from '@/lib/config/env'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('getEnv', () => {
  it('returns staging when NEXT_PUBLIC_APP_ENV=staging', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging')
    expect(getEnv()).toBe('staging')
  })

  it('returns production when NEXT_PUBLIC_APP_ENV=production', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production')
    expect(getEnv()).toBe('production')
  })

  it('falls back to development when unset', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', '')
    expect(getEnv()).toBe('development')
  })

  it('treats an unknown value as development, not a crash', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'qa')
    expect(getEnv()).toBe('development')
  })

  it('complains loudly when a production build has no APP_ENV', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', '')
    vi.stubEnv('NODE_ENV', 'production')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(getEnv()).toBe('development')

    expect(error).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_APP_ENV'))
  })

  it('is SILENT when a production build sets development ON PURPOSE', () => {
    // The #127 hole. Before the fix this printed "NEXT_PUBLIC_APP_ENV is not
    // set in this build" for a variable that was set, to a value the app
    // understands. Mutation check for whoever edits this next: delete the
    // `env === 'development'` early return in env.ts and only THIS case fails.
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'development')
    vi.stubEnv('NODE_ENV', 'production')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(getEnv()).toBe('development')

    expect(error).not.toHaveBeenCalled()
  })

  it('still complains when a production build sets NOTHING', () => {
    // The counterweight. Without it, the case above is satisfied by deleting
    // the guard altogether — which would restore the silent-dev-API bug this
    // module exists to prevent.
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', '')
    vi.stubEnv('NODE_ENV', 'production')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(getEnv()).toBe('development')

    expect(error).toHaveBeenCalledWith(expect.stringContaining('is not set in this build'))
  })

  it('complains DIFFERENTLY about a value it does not recognise', () => {
    // 'qa' is set, so "is not set" would be the same lie #127 removed. The
    // wording has to name the value back, or an operator with a typo is told
    // to set a variable they already set.
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'qa')
    vi.stubEnv('NODE_ENV', 'production')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(getEnv()).toBe('development')

    expect(error).toHaveBeenCalledWith(expect.stringContaining('is "qa"'))
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('is not set'))
  })

  it('stays quiet about the fallback outside production builds', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', '')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(getEnv()).toBe('development')

    expect(error).not.toHaveBeenCalled()
  })
})
