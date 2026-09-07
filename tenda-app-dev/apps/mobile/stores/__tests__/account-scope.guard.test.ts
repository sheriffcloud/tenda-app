/**
 * Every store must decide whether its state may outlive an account.
 *
 * Ported from web's guard (#25/#45), which exists because three stores were
 * each added long after the clearing did and were simply never wired into it —
 * not from disagreement, but because the place you had to remember (`logout`)
 * was nowhere near the file you were writing. Mobile had the same shape and no
 * such test, which is #65: chat and gigs both leaked, and every behavioural
 * case in the suite passed throughout.
 *
 * So this reads the DIRECTORY rather than a list someone maintains: a new store
 * file is a failure until it either registers a reset or is named below with a
 * reason. It cannot pass by being forgotten.
 *
 * It asserts a convention, not a behaviour, which is why it inspects source
 * text. The behaviour — that a registered reset actually empties the store at
 * sign-out, and that a response already in flight cannot write past it — is
 * `account-switch.test.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const STORES_DIR = dirname(__dirname)

/**
 * Stores whose state is the SAME for every reader, or which own the session
 * itself. Each needs a reason, because "it looked harmless" is how the leaks
 * got in.
 *
 * EXCUSED FROM REGISTERING A RESET — nothing more. It is not a finding that a
 * store's state is account-neutral, and reading it that way cost web's #45 a
 * re-audit: auth.store sits here because it clears ITSELF, but its state is as
 * account-scoped as any. Registration and the generation guard answer different
 * questions — "does someone empty this at the switch" and "can a response that
 * was already on its way write into the next account" — and an entry here
 * answers only the first.
 */
const ACCOUNT_AGNOSTIC: Record<string, string> = {
  'auth.store.ts':
    'owns the session; it is the caller of clearAccountState and resets itself. Its state IS account-scoped, and both of its sign-in paths open a new generation (#65)',
  'chain-registry.store.ts':
    'public enabled-chain registry — token addresses and decimals, identical for every reader. Clearing it would blank a rendered balance while it refetched',
  'platform-config.store.ts':
    'public fee tiers and rates, identical for every reader',
  'exchange-rate.store.ts':
    'public fiat rates from the proxied CoinGecko feed, identical for every reader and persisted under a device-wide SecureStore key with its own 5-minute TTL',
  'settings.store.ts':
    "theme and display currency, persisted under one device-wide SecureStore key. Clearing the in-memory copy would not clear the persisted one, so loadSettings would restore it on the next boot — the state is genuinely the device's, not the account's",
  'onboarding.store.ts':
    'has-seen-onboarding and dismissed nudges, persisted per install. A second account on the same device has already seen the carousel, and re-showing it would be the bug',
  'notification-prompt.store.ts':
    'prompt throttling for the OS permission dialog. Device scoped on purpose, per its own docstring: iOS spends its one-shot prompt per INSTALL, so the next account inherits a prompt that is already spent',
  'notification-permission.store.ts':
    'the OS permission plus a `registered` latch for the device token. Verified rather than assumed: usePushToken registers on every isAuthenticated edge independently of that latch, so the next account gets its own token regardless, and the latch only skips a redundant re-register on foreground',
  'realtime.store.ts':
    "holds `connected`, derived from the socket, which useRealtimeConnection tears down when isAuthenticated goes false. `openConversationId` (#56) is released by useChatRealtime on unmount, and a conversation id left behind is a uuid that can never match the next account's",
  'pending-sync.store.ts':
    'cleared EXPLICITLY by logout rather than through the registry: its clear() is async because it also empties two persisted SecureStore keys, and the registry runs resets synchronously',
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
 * the call out to debug something and not putting it back is a plausible way to
 * reintroduce the very leak this guard catches, so the call has to BEGIN a
 * statement — proved below rather than asserted.
 */
function registersReset(source: string): boolean {
  return source
    .split('\n')
    .some((line) => line.trim().startsWith('registerAccountReset('))
}

describe('registersReset', () => {
  it('accepts a real call and rejects one that is only mentioned', () => {
    expect(registersReset('registerAccountReset(() => x.reset())')).toBe(true)
    expect(registersReset('  registerAccountReset(() => x.reset())')).toBe(
      true,
    )
    expect(registersReset('// registerAccountReset(() => x.reset())')).toBe(
      false,
    )
    expect(registersReset(' * registerAccountReset(() => x.reset())')).toBe(
      false,
    )
    expect(registersReset('// see registerAccountReset( for why')).toBe(false)
  })
})

describe('account-scope classification', () => {
  it('resolves the stores directory to somewhere that HAS stores', () => {
    // A path that does not exist needs no help: readdirSync throws while the
    // cases below are collected and jest fails the file. What that does NOT
    // catch is a path resolving to a directory holding no store files — then
    // readdir succeeds, it.each([]) registers nothing, and the rest pass having
    // checked an empty set. That is the case that would report success having
    // asserted nothing.
    //
    // Anchored on a store that must exist rather than on a COUNT: a count is a
    // second thing to maintain and would fail the day two stores were merged.
    expect(storeFiles()).toContain('auth.store.ts')
  })

  it.each(storeFiles())(
    '%s is either account-scoped or documented as not',
    (name) => {
      const source = readFileSync(join(STORES_DIR, name), 'utf8')
      const registers = registersReset(source)
      const agnostic = name in ACCOUNT_AGNOSTIC

      // Both is a contradiction: a store cannot be device-wide AND cleared per account.
      expect(registers && agnostic).toBe(false)
      expect(registers || agnostic).toBe(true)
    },
  )

  it('has no stale entries — an allowlist may not outlive the file it excuses', () => {
    const present = new Set(storeFiles())
    for (const name of Object.keys(ACCOUNT_AGNOSTIC)) {
      expect(present.has(name)).toBe(true)
    }
  })

  it('gives every excused store a REASON, not just an entry', () => {
    // Reported as the offending NAMES rather than a bare length assertion, so a
    // failure says which store is excused without saying why.
    const unexplained = Object.entries(ACCOUNT_AGNOSTIC)
      .filter(([, reason]) => reason.trim().length <= 20)
      .map(([name]) => name)

    expect(unexplained).toEqual([])
  })
})
