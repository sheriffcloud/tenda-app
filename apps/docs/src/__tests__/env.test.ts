/**
 * Which deployment this build points at, and whether it was told.
 *
 * The default matters: a contributor with no env file must not have a Run
 * button pointed at production, and a configured URL with a trailing slash
 * must not produce `https://api//v1/gigs`.
 *
 * `configured` matters for a different reason. The page PRINTS this origin
 * now, so a deployed build that was never given the variable does not fail
 * quietly — it tells every reader the API is at localhost. The flag is what
 * the page uses to say so instead.
 */
import { describe, expect, it } from 'vitest'
import { API_BASE_URL_VAR, apiBase, apiBaseUrl } from '@/env'

describe('apiBaseUrl', () => {
  it('falls back to the local server when nothing is configured', () => {
    expect(apiBaseUrl({} as ImportMetaEnv)).toBe('http://localhost:3000')
    expect(apiBaseUrl({ VITE_API_BASE_URL: '' } as ImportMetaEnv)).toBe('http://localhost:3000')
  })

  it('uses what is configured, without a trailing slash', () => {
    expect(apiBaseUrl({ VITE_API_BASE_URL: 'https://api.tendahq.com' } as ImportMetaEnv)).toBe('https://api.tendahq.com')
    expect(apiBaseUrl({ VITE_API_BASE_URL: 'https://api.tendahq.com//' } as ImportMetaEnv)).toBe('https://api.tendahq.com')
  })
})

describe('apiBase', () => {
  it('says a configured origin was configured', () => {
    expect(apiBase({ VITE_API_BASE_URL: 'https://api.tendahq.com' } as ImportMetaEnv))
      .toEqual({ url: 'https://api.tendahq.com', configured: true })
  })

  it.each([
    ['nothing at all', {}],
    ['an empty string', { VITE_API_BASE_URL: '' }],
  ])('says a fallback is a fallback when it was given %s', (_case, env) => {
    // Both reach the same URL, and the page must be able to tell them apart
    // from a deployment that meant to point at localhost.
    expect(apiBase(env as ImportMetaEnv)).toEqual({ url: 'http://localhost:3000', configured: false })
  })

  it('reads the variable this module NAMES — the name and the read cannot drift', () => {
    // The page prints `API_BASE_URL_VAR` when the origin is missing, telling an
    // operator which variable to set. The read itself stays a static property
    // access, because that is the form Vite replaces at build time — so the
    // name is a second copy, and this is what holds the two together. Renaming
    // one without the other tells the operator to set a variable that does
    // nothing, and this case is where that shows up.
    // The same single cast every case in this file uses — vite/client's own
    // BASE_URL/MODE/DEV/PROD/SSR are not what is under test. `API_BASE_URL_VAR`
    // is a literal type, so the computed key resolves to exactly the property
    // `apiBase` reads; a renamed constant stops matching and this goes red.
    expect(apiBase({ [API_BASE_URL_VAR]: 'https://named.test' } as ImportMetaEnv))
      .toEqual({ url: 'https://named.test', configured: true })
  })
})
