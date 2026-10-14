import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { APP_INFO, GUARANTEE_WITHOUT_HOURS, guaranteeAfter, guaranteeForWindows } from '../../src/constants/app-info'

/**
 * The guard whose absence let the product accumulate NINE competing pitches.
 *
 * Two rival taglines, a canonical description that named only gigs, and six
 * restatements across three apps. Every one of them was a reasonable local
 * edit; nothing was checking that they still agreed. This walks the apps and
 * fails when a retired phrase comes back, or when an app hardcodes a string
 * shared already owns instead of importing it.
 */

const APPS = join(__dirname, '..', '..', '..', '..', 'apps')
const SKIP = new Set(['node_modules', 'dist', '.next', 'coverage', 'build', '.expo', 'Tenda V2'])
const EXT = ['.ts', '.tsx', '.html', '.json']

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (EXT.some((e) => entry.endsWith(e))) out.push(full)
  }
  return out
}

/** Read once — this walk is the expensive part, not the assertions. */
const FILES = sourceFiles(APPS).map((path) => ({ path, text: readFileSync(path, 'utf8') }))

test('the app tree is actually being scanned', () => {
  // Guards the guard. A wrong path, a renamed folder or an over-eager SKIP
  // entry would make every assertion below pass by finding nothing at all.
  assert.ok(FILES.length > 200, `expected to scan the apps, saw ${FILES.length} files`)
  assert.ok(
    FILES.some((f) => f.path.endsWith(join('web', 'app', 'layout.tsx'))),
    'the web app should be in the scan',
  )
})

/**
 * Phrases withdrawn on 2026-08-31, with the reason each one went. A test that
 * only said "do not use these" would be re-litigated the first time someone
 * liked one; the reasons are the point.
 */
const RETIRED: readonly { phrase: string; why: string }[] = [
  {
    phrase: 'Get paid. No middlemen.',
    why: 'ambiguous beside a flat platform fee and a Tenda-run relayer — it denies an intermediary instead of naming the contract that replaces one',
  },
  {
    phrase: 'Payment guaranteed',
    why: 'overstates: nothing auto-approves. The real right is claimStalledPayment, which APP_INFO.guarantee states exactly',
  },
  {
    phrase: 'Post or accept gigs',
    why: 'describes half the product — P2P cash trades are the other half, and this string reaches every meta tag and the wallet modal',
  },
]

test('no retired pitch phrase has come back anywhere in the apps', () => {
  for (const { phrase, why } of RETIRED) {
    const found = FILES.filter((f) => f.text.includes(phrase)).map((f) => f.path)
    assert.deepEqual(found, [], `"${phrase}" is retired: ${why}`)
  }
})

test('no app hardcodes a pitch string shared already owns', () => {
  // Importing APP_INFO is correct; retyping its value is how a second copy
  // starts. index.html is the one exception below, and it has its own test.
  const owned: readonly [string, string][] = [
    ['tagline', APP_INFO.tagline],
    ['shortPitch', APP_INFO.shortPitch],
  ]
  for (const [role, value] of owned) {
    const copies = FILES.filter((f) => !f.path.endsWith('.html') && f.text.includes(value)).map(
      (f) => f.path,
    )
    assert.deepEqual(copies, [], `APP_INFO.${role} is duplicated as a literal — import it instead`)
  }
})

test('the landing’s static meta description is the shared one, exactly', () => {
  // index.html cannot import TypeScript, so this is the one place the product
  // line is legitimately retyped — which makes it the one place that can
  // silently disagree with every other surface.
  const html = FILES.find((f) => f.path.endsWith(join('tendahq', 'index.html')))
  assert.ok(html, 'the landing index.html should be in the scan')
  assert.ok(
    html.text.includes(`content="${APP_INFO.description}"`),
    'apps/tendahq/index.html meta description must equal APP_INFO.description verbatim',
  )
  // The link-preview description is the same retyped line, so it is pinned to
  // the same source rather than left to drift on its own.
  assert.ok(
    html.text.includes(`property="og:description" content="${APP_INFO.description}"`),
    'apps/tendahq/index.html og:description must equal APP_INFO.description verbatim',
  )
})

test('the three roles are distinct, and none is empty', () => {
  const roles = [APP_INFO.tagline, APP_INFO.description, APP_INFO.shortPitch]
  assert.equal(new Set(roles).size, roles.length, 'two roles carry the same string')
  for (const role of roles) assert.ok(role.trim().length > 0)
})

test('the product line covers both products and both kinds of poster', () => {
  // The two omissions that caused this: gigs without exchange, people without
  // agents. Asserted on the canonical string because it is the one that
  // reaches store listings, OG cards and the wallet modal.
  const lower = APP_INFO.description.toLowerCase()
  assert.match(lower, /gig/, 'the description must name gig work')
  assert.match(lower, /p2p|cash trade|exchange/, 'the description must name the exchange half')
  assert.match(lower, /agent/, 'the description must say agents can hire too')
})

test('the static guarantee names the right and NO number of hours (#148)', () => {
  // The window is a contract value that differs per chain (Celo mainnet 24h,
  // the testnets 48h). A static count promised 48 hours on the deployment
  // that enforces 24; the static form may state the right, never the hours.
  assert.equal(APP_INFO.guarantee, GUARANTEE_WITHOUT_HOURS)
  assert.doesNotMatch(APP_INFO.guarantee, /\d/)
  assert.match(APP_INFO.guarantee, /claim it yourself/)
})

test('guaranteeForWindows names the hours only when every served chain agrees', () => {
  assert.equal(guaranteeForWindows([86_400]), guaranteeAfter(24))
  assert.equal(guaranteeForWindows([172_800, 172_800]), guaranteeAfter(48))
  // A 24h chain beside a 48h chain: no one number is true for the deployment.
  assert.equal(guaranteeForWindows([86_400, 172_800]), GUARANTEE_WITHOUT_HOURS)
  // Registry not loaded yet, or a deployment serving nothing: same fallback.
  assert.equal(guaranteeForWindows([]), GUARANTEE_WITHOUT_HOURS)
  // Seconds → whole hours, the unit the sentence speaks.
  assert.match(guaranteeForWindows([90_000]), /25 hours/)
})

test('a different window produces different copy — the number is not decorative', () => {
  // The failure this catches is a literal "48" creeping into the template,
  // which would keep passing the tests above while lying on any deployment
  // whose contract says otherwise.
  assert.notEqual(guaranteeAfter(24), guaranteeAfter(48))
  assert.match(guaranteeAfter(24), /24 hours/)
  assert.doesNotMatch(guaranteeAfter(24), /48/)
})

const DISPUTE_WORD = /\b(?:disput\w*|arbitrat\w*)/i
const RESOLUTION_VERB = /\b(?:resolv\w*|decid\w*|settl\w*|review\w*|handl\w*|rul(?:e|ed|ing)\b|answer\w*)/i
const WITHIN_DURATION = /\b(?:within|in|under|inside)\s+(?:a\s+|an\s+)?\d+\s?(?:h|hr|hrs|hours?|business days?|days?)\b/i

/**
 * A sentence that names a dispute, a way of dealing with it, AND a deadline.
 * Sentence-scoped on purpose: "raise a third dispute inside 90 days" is a
 * reputation window (no resolution verb), and "the review window is 24 hours"
 * names no dispute — neither is a promise about how fast one gets decided.
 */
function promisesDisputeTime(text: string): boolean {
  return text
    .split(/[.\n]/)
    .some((s) => DISPUTE_WORD.test(s) && RESOLUTION_VERB.test(s) && WITHIN_DURATION.test(s))
}

test('the dispute-promise pattern discriminates', () => {
  // Without this, a regex that matches nothing passes the guard below forever.
  for (const promise of [
    'Disputes are resolved within 24 hours.',
    'Every dispute is decided in 2 business days',
    'Within 48h we review any dispute',
    'A dispute is settled in 1 day',
  ]) {
    assert.ok(promisesDisputeTime(promise), promise)
  }
  for (const fine of [
    'Disputes cost nothing to open today; the review window is 24 hours.',
    'raise another dispute within the cooldown',
    'limited to 3 disputes inside 90 days',
  ]) {
    assert.ok(!promisesDisputeTime(fine), fine)
  }
})

test('nothing promises a dispute-resolution time', () => {
  // Withdrawn 2026-10-04: disputes are decided by a human (the dispute
  // authority signs the resolve tx), so no surface may commit to "resolved
  // within 24 hours" — a promise the product cannot keep when the queue is
  // long. The approval/review WINDOW is a different, contract-enforced number
  // and is not matched: this looks for dispute and a duration in one sentence.
  const found = FILES.filter((f) => promisesDisputeTime(f.text)).map((f) => f.path)
  assert.deepEqual(found, [], 'a dispute-resolution time promise is on a user-facing surface')
})
