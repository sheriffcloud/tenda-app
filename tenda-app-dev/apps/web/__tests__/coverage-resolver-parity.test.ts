/**
 * @vitest-environment node
 *
 * The two coverage-subject resolvers must not drift apart quietly.
 *
 * `apps/web/test-support/coverage-subjects.ts` is a deliberate copy of
 * `apps/mobile/test-support/coverage-subjects.ts` (#69, tracked as #77). The
 * duplication was kept because the half that differs is the half a wrong answer
 * breaks: each app asks its OWN runner what it gates, and a checker that
 * disagrees with its gate is worse than no checker.
 *
 * #77 re-examined that decision and kept it — no third consumer exists (server,
 * admin and tendahq have no such gate), and the pure half had not drifted. But
 * "revisit on drift" was a promise nothing could keep: the copies could diverge
 * silently, and the next person would find out by reading both files, which is
 * exactly what nobody does. This suite is what makes the promise keepable.
 *
 * It compares the two files' FUNCTION BODIES with comments stripped and
 * whitespace collapsed, so it trips on a change in behaviour rather than on
 * reformatting — and each function is classified as one that must match or one
 * that is allowed to differ WITH ITS REASON, so neither list can rot.
 *
 * NODE environment, because this reads two source files off disk and needs no
 * DOM; the pragma is what lets it run without jsdom's cost.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WEB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const RESOLVERS = {
  web: path.join(WEB_ROOT, 'test-support/coverage-subjects.ts'),
  mobile: path.join(WEB_ROOT, '../mobile/test-support/coverage-subjects.ts'),
}

/**
 * The pure path logic. Byte-identical on both sides today, and the whole reason
 * the duplication is tolerable: if these ever disagree, one app is resolving
 * subjects the other is not, and a gate is measuring the wrong set.
 */
const MUST_MATCH = [
  'toKey',
  'isTestSupport',
  'listFiles',
  'resolveModule',
  'ownerOf',
  'subjectByName',
] as const

/**
 * The runner seam — allowed to differ, and each entry says why. A reason here
 * is not a shrug: it is the claim that the difference is FORCED by the runner,
 * which is the entire justification for keeping two copies.
 */
const MAY_DIFFER: Record<string, string> = {
  collectTestSubjects:
    "mobile injects jest's own globsToMatcher(testMatch), because jest has TWO test " +
    'patterns and honouring only one left a suite invisible (#71); web pins its single ' +
    'pattern structurally and asserts the config still says it, because vitest resolves ' +
    'test.include with tinyglobby. #82 gave web `sourceFiles` too, so both return the ' +
    'same four fields and both run an inert-pattern check — but they FILTER that ' +
    'set differently on purpose: mobile drops fixtures from it, while web keeps ' +
    'them as candidates so its per-pattern matcher can judge an entry that only ' +
    'reaches fixtures as dead (#83)',
  subjectsByImport:
    'the same test-file predicate, plus the mocking call each runner uses — jest.mock vs vi.mock in IMPORT_SPECIFIER',
  inTestsDirectory:
    "web-only: it IS web's test-file predicate, standing where mobile takes an injected matcher",
}

/** A function's body, comments stripped and whitespace collapsed. */
function bodyOf(source: string, name: string): string | null {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const match = new RegExp(`^(?:export )?function ${name}\\b[\\s\\S]*?\\n}`, 'm').exec(stripped)
  return match === null ? null : match[0].replace(/\s+/g, ' ').trim()
}

/**
 * Every top-level function a file declares.
 *
 * KNOWN LIMIT, stated because both resolvers' own headers say a checker that
 * overclaims is worse than none: this sees `function` DECLARATIONS only. A
 * helper written as a top-level `const foo = () => …` would not be classified
 * and would slip past the partition below. Neither copy has one today — every
 * helper in both is a declaration — and the two files are the kind that get
 * copied from each other, so the shape is unlikely to appear on one side alone.
 * If it ever does, this is the function to widen.
 */
function functionNames(source: string): string[] {
  return [...source.matchAll(/^(?:export )?function (\w+)\b/gm)].map((m) => m[1]).sort()
}

const sources = {
  web: fs.readFileSync(RESOLVERS.web, 'utf8'),
  mobile: fs.readFileSync(RESOLVERS.mobile, 'utf8'),
}

describe('the two coverage-subject resolvers (#77)', () => {
  it('finds both files, so the comparison cannot pass vacuously', () => {
    // A moved or renamed resolver would otherwise make every case below compare
    // nothing at all and report success.
    //
    // Anchored on a NAME rather than a count, the way the coverage-gate suite
    // beside this one is: a threshold is a second thing to maintain and says
    // nothing about whether the right file was read. `subjectByName` is the
    // function whose identity matters most — it carries the dot-stripping loop.
    expect(functionNames(sources.mobile)).toContain('subjectByName')
    expect(functionNames(sources.web)).toContain('subjectByName')
  })

  it('classifies every function in either copy — no third category', () => {
    const known = new Set<string>([...MUST_MATCH, ...Object.keys(MAY_DIFFER)])
    const unclassified = [
      ...new Set([...functionNames(sources.web), ...functionNames(sources.mobile)]),
    ]
      .filter((name) => !known.has(name))
      .sort()
    expect(unclassified).toEqual([])
  })

  it.each(MUST_MATCH)('%s is identical in both copies', (name) => {
    const web = bodyOf(sources.web, name)
    const mobile = bodyOf(sources.mobile, name)
    // Asserted present as well as equal: two nulls are equal, and that is how a
    // renamed function would slip through as a pass.
    expect(web, `${name} is missing from web's copy`).not.toBeNull()
    expect(mobile, `${name} is missing from mobile's copy`).not.toBeNull()
    expect(web).toBe(mobile)
  })

  it('keeps no allowance for a function that no longer differs', () => {
    // An entry here excuses a difference. When the difference goes, the entry
    // has to go too, or the register slowly becomes a list of things nobody
    // checks — the same rot the ungated-file registers are guarded against.
    const identical = Object.keys(MAY_DIFFER).filter((name) => {
      const web = bodyOf(sources.web, name)
      const mobile = bodyOf(sources.mobile, name)
      return web !== null && mobile !== null && web === mobile
    })
    expect(identical).toEqual([])
  })

  it('keeps no allowance for a function neither copy declares any more', () => {
    // The other way this register rots, and the one its siblings all guard:
    // `keeps no allowance for a function that no longer differs` needs BOTH
    // bodies to compare, so an entry naming a function that has been deleted
    // outright sails past it excusing nothing.
    const absent = Object.keys(MAY_DIFFER).filter(
      (name) => bodyOf(sources.web, name) === null && bodyOf(sources.mobile, name) === null,
    )
    expect(absent).toEqual([])
  })

  it('gives every allowed difference a REASON, not just an entry', () => {
    const unexplained = Object.entries(MAY_DIFFER)
      .filter(([, reason]) => reason.trim().length <= 20)
      .map(([name]) => name)
    expect(unexplained).toEqual([])
  })
})
