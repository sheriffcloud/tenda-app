/**
 * `?next=` is attacker-supplied, and an unvalidated one is an open redirect:
 * a link to OUR sign-in page that lands the reader on somebody else's, with
 * our domain in the part of the URL a person actually reads.
 *
 * So the refusals lead here, and each is written as its own case rather than a
 * loop over a list — a loop reports "the table failed" and these fail for
 * different reasons, each of which is a different way past a naive check.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  currentReturnPath,
  DEFAULT_SIGNED_IN_PATH,
  RETURN_PARAM,
  readReturnParam,
  returnPathFrom,
  safeReturnPath,
  signedInDestination,
  withReturnPath,
} from '@/lib/auth/return-path'

describe('safeReturnPath — what it refuses', () => {
  it('refuses an absolute URL', () => {
    expect(safeReturnPath('https://evil.example/phish')).toBeNull()
  })

  it('refuses a scheme', () => {
    expect(safeReturnPath('javascript:alert(1)')).toBeNull()
  })

  it('refuses a PROTOCOL-RELATIVE url, which keeps our scheme and changes origin', () => {
    // The one a "must start with /" check waves through: the browser resolves
    // //evil.example against the current scheme and leaves our site entirely.
    expect(safeReturnPath('//evil.example/phish')).toBeNull()
  })

  it('refuses the BACKSLASH form of the same trick', () => {
    // Browsers normalise the backslash to a slash while resolving, so this is
    // protocol-relative by another spelling — and it starts with exactly one
    // '/', so the check above does not see it.
    expect(safeReturnPath('/\\evil.example')).toBeNull()
    expect(safeReturnPath('/\\\\evil.example')).toBeNull()
  })

  it('refuses control characters, which URL parsers strip before resolving', () => {
    // '/<tab>/evil.example' is stripped to '//evil.example' by the parser, so
    // a prefix test on the raw string is looking at a different value than the
    // browser will act on.
    // Written as ESCAPES, never as the literal bytes: a raw NUL or tab in a
    // source file is invisible to whoever reads this next, and they cannot
    // tell which character is being refused.
    expect(safeReturnPath('/\t/evil.example')).toBeNull()
    expect(safeReturnPath('/\n//evil.example')).toBeNull()
    expect(safeReturnPath('/\u0000//evil.example')).toBeNull()
  })

  it('does NOT refuse an interior space, which is not an escape at all', () => {
    // Worth stating, because the refusals above look like "reject odd
    // characters" and are not. Leading whitespace IS handled — a URL parser
    // strips it, and '  //evil.example' fails the leading-slash test. An
    // interior space cannot change the origin: it percent-encodes and stays a
    // path on this site, so refusing it would be a rule with no attack behind
    // it.
    expect(safeReturnPath('/ //evil.example')).toBe('/ //evil.example')
    expect(safeReturnPath('  //evil.example')).toBeNull()
  })

  it('refuses nothing at all', () => {
    expect(safeReturnPath(null)).toBeNull()
    expect(safeReturnPath(undefined)).toBeNull()
    expect(safeReturnPath('')).toBeNull()
  })

  it('refuses a path inside the sign-in flow — not hostile, but a LOOP', () => {
    expect(safeReturnPath('/signin')).toBeNull()
    expect(safeReturnPath('/signin/verify')).toBeNull()
    expect(safeReturnPath('/onboarding/profile')).toBeNull()
  })

  it('allows forms that LOOK hostile but cannot leave this origin', () => {
    // Swept during review and kept on purpose, because each is the kind of
    // thing a later reader would "fix" without checking. The proof is the URL
    // resolution itself rather than an opinion: resolved against our own
    // origin, every one of these stays on it.
    for (const path of ['/%2F%2Fevil.example', '/..//evil.example', '/@evil.example']) {
      expect(safeReturnPath(path)).toBe(path)
      expect(new URL(path, 'https://tenda.test').origin).toBe('https://tenda.test')
    }
    // The near-miss that IS refused, for contrast: userinfo after a
    // protocol-relative opener really does change origin.
    expect(safeReturnPath('//@evil.example')).toBeNull()
    expect(new URL('//@evil.example', 'https://tenda.test').origin).not.toBe('https://tenda.test')
  })

  it('does NOT refuse a path that merely starts with those letters', () => {
    // The prefix test is on a path SEGMENT. '/signin-help' is a different
    // route, and refusing it would be a bug of the same family as accepting
    // '/signin'.
    expect(safeReturnPath('/signin-help')).toBe('/signin-help')
    expect(safeReturnPath('/onboarding-guide')).toBe('/onboarding-guide')
  })
})

describe('safeReturnPath — what it allows', () => {
  it('allows an ordinary app path, hyphens and all', () => {
    // The case a too-eager character check breaks: every real route here has
    // a hyphen in it.
    expect(safeReturnPath('/my-gigs/esc-123')).toBe('/my-gigs/esc-123')
    expect(safeReturnPath('/wallet/buy-sell')).toBe('/wallet/buy-sell')
  })

  it('keeps a query string and a fragment, which are part of the destination', () => {
    expect(safeReturnPath('/exchange?chain_id=solana:devnet')).toBe(
      '/exchange?chain_id=solana:devnet',
    )
    expect(safeReturnPath('/?q=tiler&offset=20')).toBe('/?q=tiler&offset=20')
    // The fragment half, which this name promised and did not check until the
    // review: '#reviews' is where on the page the reader was, and '#' has to
    // survive the encode/decode round trip through the param to get there.
    expect(safeReturnPath('/gig/esc-1#reviews')).toBe('/gig/esc-1#reviews')
    const href = withReturnPath('/signin', '/gig/esc-1#reviews')
    const carried = new URL(href, 'https://tenda.test').searchParams.get(RETURN_PARAM)
    expect(safeReturnPath(carried)).toBe('/gig/esc-1#reviews')
  })
})

describe('withReturnPath', () => {
  it('leaves an href alone when there is nothing to carry', () => {
    // The ordinary sign-in keeps a clean, canonical URL.
    expect(withReturnPath('/signin/email', null)).toBe('/signin/email')
  })

  it('encodes the destination so its own query survives the round trip', () => {
    const href = withReturnPath('/signin/email', '/?q=tiler&offset=20')
    expect(href).toBe(`/signin/email?${RETURN_PARAM}=%2F%3Fq%3Dtiler%26offset%3D20`)
    // The proof that matters: what a reader of the param gets back.
    const value = new URL(href, 'https://tenda.test').searchParams.get(RETURN_PARAM)
    expect(safeReturnPath(value)).toBe('/?q=tiler&offset=20')
  })

  it('appends with & when the href already has a query', () => {
    expect(withReturnPath('/signin?mode=x', '/home2')).toBe(
      `/signin?mode=x&${RETURN_PARAM}=%2Fhome2`,
    )
  })
})

describe('signedInDestination', () => {
  it('returns the destination when it is one of ours', () => {
    expect(signedInDestination('/my-gigs/esc-123')).toBe('/my-gigs/esc-123')
  })

  it('falls back to the default rather than trusting a hostile one', () => {
    expect(signedInDestination('//evil.example')).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(signedInDestination(null)).toBe(DEFAULT_SIGNED_IN_PATH)
  })
})

describe('returnPathFrom', () => {
  it('carries a real destination', () => {
    expect(returnPathFrom('/my-gigs/esc-1')).toBe('/my-gigs/esc-1')
  })

  it('carries NOTHING when they were already heading for a default entry', () => {
    // Otherwise the commonest redirect of all grows a param that reads as
    // though it changes something and does not.
    expect(returnPathFrom(DEFAULT_SIGNED_IN_PATH)).toBeNull()
    expect(returnPathFrom('/')).toBeNull()
  })

  it('carries nothing for a destination it would refuse anyway', () => {
    expect(returnPathFrom('//evil.example')).toBeNull()
    expect(returnPathFrom('/signin/verify')).toBeNull()
  })
})

describe('readReturnParam', () => {
  it('validates an ordinary single value', () => {
    expect(readReturnParam('/my-gigs/esc-1')).toBe('/my-gigs/esc-1')
    expect(readReturnParam('//evil.example')).toBeNull()
  })

  it('treats a missing param as no destination', () => {
    expect(readReturnParam(undefined)).toBeNull()
  })

  it('refuses a REPEATED param outright rather than picking one', () => {
    // Next hands `?next=/safe&next=//evil.example` through as an array, and
    // nothing we write ever produces one — so it is hand-built. Taking the
    // first would accept the decoy; taking the last would accept the attack.
    expect(readReturnParam(['/safe', '//evil.example'])).toBeNull()
    expect(readReturnParam(['//evil.example', '/safe'])).toBeNull()
  })
})

describe('currentReturnPath', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('reads and validates the destination out of the current URL', () => {
    window.history.replaceState({}, '', '/signin?next=%2Fmy-gigs%2Fesc-1')
    expect(currentReturnPath()).toBe('/my-gigs/esc-1')
  })

  it('refuses a hostile one in the URL just the same', () => {
    window.history.replaceState({}, '', '/signin?next=%2F%2Fevil.example')
    expect(currentReturnPath()).toBeNull()
  })

  it('answers null on the SERVER, where there is no URL to read', () => {
    // The guard that lets this module be imported by a page Next prerenders.
    // Without it the build fails at the point it renders that page to HTML.
    vi.stubGlobal('window', undefined)
    expect(currentReturnPath()).toBeNull()
  })
})
