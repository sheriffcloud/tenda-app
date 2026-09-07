/**
 * Every store must decide whether its state may outlive an account.
 *
 * This is the test that would have caught #25 three tasks earlier. `gigs`,
 * `escrow` and `signin-flow` were each added long after the clearing existed,
 * and each was simply never wired into it — not because anyone disagreed, but
 * because the place you had to remember (`logout`) was nowhere near the file
 * you were writing. Every behavioural test in the suite passed throughout.
 *
 * So this one reads the DIRECTORY rather than a list someone maintains: a new
 * store file is a failure until it either registers a reset or is named below
 * with a reason. It cannot pass by being forgotten.
 *
 * It asserts a convention, not a behaviour, which is why it inspects source
 * text. The behaviour — that a registered reset actually empties the store on
 * sign-out and on a cross-tab switch — is `account-switch.test.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const STORES_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * Stores whose state is the SAME for every reader, or which own the session
 * itself. Each needs a reason, because "it looked harmless" is how the three
 * leaks got in.
 *
 * EXCUSED FROM REGISTERING A RESET — nothing more. It is not a finding that a
 * store's state is account-neutral, and reading it that way is what cost #45 a
 * re-audit: auth.store sits here because it clears ITSELF, but its state is as
 * account-scoped as any, and all four of its in-flight writers were left
 * unguarded on the strength of this line. Registration and the generation
 * guard answer different questions — "does someone empty this at the switch"
 * and "can a response that was already on its way write into the next
 * account" — and an entry here answers only the first.
 */
const ACCOUNT_AGNOSTIC: Record<string, string> = {
  'auth.store.ts':
    'owns the session; resets itself to SIGNED_OUT and drives the clearing of everything else. Its state IS account-scoped — every async writer in it takes an accountGeneration snapshot (#45)',
  'chain-registry.store.ts':
    'public enabled-chain registry — token addresses, identical for every reader. Clearing it would blank a rendered balance while it refetched',
  'platform-config.store.ts':
    'public fee tiers and rates, identical for every reader',
  'gigs-browse.store.ts':
    'a category and a search over the PUBLIC open-gig feed (#60) — the same rows for every reader, nothing personal. Left set across a same-tab switch it narrows a public list for the next account and leaks nothing',
  'realtime.store.ts':
    'the STORE holds only `connected`, derived from the socket, and useRealtimeConnection tears that socket down when isAuthenticated goes false. The module also holds `openConversationId` (#47): not state that needs clearing — useChatRealtime releases it on unmount, and a conversation id left behind is a uuid that can never match the next account\'s',
}

function storeFiles(): string[] {
  return readdirSync(STORES_DIR)
    .filter((name) => name.endsWith('.store.ts'))
    .sort()
}

/**
 * Whether the file REGISTERS, as opposed to merely mentioning it.
 *
 * A plain substring test passes on `// registerAccountReset(...)`. Commenting
 * the call out to debug something and not putting it back is a plausible way
 * to reintroduce the very leak this guard exists to catch, and it sailed
 * through the first version of this file — verified with a decoy store whose
 * registration was commented out. So the call has to begin a statement.
 */
function registersReset(source: string): boolean {
  return source.split('\n').some((line) => line.trim().startsWith('registerAccountReset('))
}

describe('registersReset', () => {
  it('accepts a real call and rejects one that is only mentioned', () => {
    expect(registersReset('registerAccountReset(() => x.reset())')).toBe(true)
    expect(registersReset('  registerAccountReset(() => x.reset())')).toBe(true)
    expect(registersReset('// registerAccountReset(() => x.reset())')).toBe(false)
    expect(registersReset(' * registerAccountReset(() => x.reset())')).toBe(false)
    expect(registersReset('// see registerAccountReset( for why')).toBe(false)
  })
})

describe('account-scope classification', () => {
  it('resolves the stores directory to somewhere that HAS stores', () => {
    // A path that does not exist needs no help: readdirSync throws while the
    // cases below are being collected, and vitest fails the file (verified —
    // exit 1, "Test Files 1 failed", zero tests run).
    //
    // What that does NOT catch is a path that resolves to a directory holding
    // no store files — stores moved, or a refactor that left this pointing at
    // a parent. Then readdir succeeds, `it.each([])` registers nothing, and
    // the remaining cases pass while the classification is checked against an
    // empty set. This is the case that would report success having asserted
    // nothing.
    //
    // Anchored on a store that must exist rather than on a COUNT: a count is a
    // second thing to maintain, and it would fail the day two stores were
    // legitimately merged.
    expect(storeFiles()).toContain('auth.store.ts')
  })

  it.each(storeFiles())('%s is either account-scoped or documented as not', (name) => {
    const source = readFileSync(join(STORES_DIR, name), 'utf8')
    const registers = registersReset(source)
    const agnostic = name in ACCOUNT_AGNOSTIC

    // Both is a contradiction: a store cannot be public AND cleared per account.
    expect(registers && agnostic).toBe(false)
    expect(registers || agnostic).toBe(true)
  })

  it('has no stale entries — an allowlist may not outlive the file it excuses', () => {
    const present = new Set(storeFiles())
    for (const name of Object.keys(ACCOUNT_AGNOSTIC)) {
      expect(present.has(name)).toBe(true)
    }
  })

  it('gives every excused store a REASON, not just an entry', () => {
    // Reported as the offending NAMES rather than a bare length assertion, so
    // a failure says which store is excused without saying why.
    const unexplained = Object.entries(ACCOUNT_AGNOSTIC)
      .filter(([, reason]) => reason.trim().length <= 20)
      .map(([name]) => name)

    expect(unexplained).toEqual([])
  })
})
