import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { APP_INFO, guaranteeAfter } from '../../src/constants/app-info'
import { PLATFORM_CONFIG_DEFAULTS } from '../../src/constants/platform'

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

test('the guarantee derives its window and never hardcodes the hours', () => {
  const hours = Math.round(PLATFORM_CONFIG_DEFAULTS.approval_window_seconds / 3600)
  assert.equal(APP_INFO.guarantee, guaranteeAfter(hours))
  assert.match(APP_INFO.guarantee, new RegExp(`${hours} hours`))
})

test('a different window produces different copy — the number is not decorative', () => {
  // The failure this catches is a literal "48" creeping into the template,
  // which would keep passing the test above while lying on any deployment
  // whose platform_config says otherwise.
  assert.notEqual(guaranteeAfter(24), guaranteeAfter(48))
  assert.match(guaranteeAfter(24), /24 hours/)
  assert.doesNotMatch(guaranteeAfter(24), /48/)
})
