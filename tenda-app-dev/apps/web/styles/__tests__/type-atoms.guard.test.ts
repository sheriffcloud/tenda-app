/**
 * Every text size in the app is a generated `type-*` atom (#63) — or one of
 * the uses named below with the reason it is not.
 *
 * Two contracts, both of which #63 measured rather than assumed:
 *
 *  1. `text-[Npx]` survives only where NO atom fits: an off-scale line-height
 *     that the reading experience depends on (a 17/28 brief), a responsive
 *     heading (32 → 44 across a breakpoint), or a size the scale does not
 *     have (8, 10, 13.5, 14, 14.5, 26, 28). The register reads the DIRECTORY, so a new
 *     ad-hoc size fails here until it is either migrated or named with a
 *     reason — it cannot pass by being forgotten.
 *
 *  2. An override beside an atom — `type-body-small font-semibold`,
 *     `type-title font-numeric` — only works because the atom sorts BEFORE the
 *     core utility in the built stylesheet. That is a property of Tailwind's
 *     output, not of the source, so it is proven by compiling the real
 *     stylesheet: the day it flips, 60-odd overrides silently stop applying.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const WEB_ROOT = `${process.cwd()}/`
const GLOBALS = `${WEB_ROOT}app/globals.css`

/**
 * The register: file → how many `text-[Npx]` it keeps, and why. A count so a
 * SECOND ad-hoc size in a file that legitimately has one still fails. A
 * responsive heading counts each breakpoint's size (`sm:text-[44px]` too).
 */
const OFF_SCALE: Record<string, { count: number; reason: string }> = {
  'app/(focused)/welcome/page.tsx': { count: 3, reason: 'responsive 34→44 display headline (two sizes); a 17/26 lede the scale has no pair for' },
  'app/(public)/foundations/page.tsx': { count: 3, reason: 'responsive 32→44 display headline (two sizes); a 17/28 lede' },
  'components/app/status/StatusScreen.tsx': { count: 2, reason: 'responsive 26→30 display headline (two sizes)' },
  'components/app/workspace/rail/RailBadge.tsx': { count: 1, reason: '10px counter in a 16px disc, leading-none' },
  'components/app/workspace/rows/RowChassis.tsx': { count: 1, reason: '11/16 mono timestamp — the caption atom is 14 and would misalign the row' },
  'components/auth/AuthPanel.tsx': { count: 2, reason: 'responsive 26→30 display headline (two sizes)' },
  'components/chat/ChatContextDivider.tsx': { count: 2, reason: '10.5px mono divider labels — smaller than the caption atom on purpose' },
  'components/chat/MessageBubble.tsx': { count: 1, reason: '14.5/20 bubble body — mobile’s bubble size, between body-small and body' },
  'components/dispute/DisputeContextHeader.tsx': { count: 1, reason: '13.5px party name in the context chip' },
  'components/dispute/DisputeMessageBubble.tsx': { count: 1, reason: '14.5/20 bubble body — mobile’s bubble size, between body-small and body' },
  'components/escrow/dossier/EscrowDossier.tsx': { count: 1, reason: '28/36 display title — between h2 (22) and h1 (30)' },
  'components/exchange/detail/OfferHeadline.tsx': { count: 1, reason: '11/16 bold mono uppercase chip' },
  'components/exchange/market/OfferCard.tsx': { count: 3, reason: '11/16 semibold chips and a 28/32 mono rate figure' },
  'components/gig/detail/GigBrief.tsx': { count: 1, reason: '17/28 reading measure for a poster-written brief' },
  'components/gig/detail/GigDetailHeader.tsx': { count: 2, reason: 'clamp() responsive h1 with relative leading; an 11/16 semibold chip' },
  'components/notifications/AnnouncementCard.tsx': { count: 2, reason: '14.5/13.5 broadcast card — mobile’s announcement sizes, between the atoms' },
  'components/onboarding/OnboardingCarousel.tsx': { count: 1, reason: '17/26 lede the scale has no pair for' },
  'components/profile/StandingBadge.tsx': { count: 1, reason: '11.5px standing chip label' },
  'components/public/NotFoundPanel.tsx': { count: 3, reason: 'responsive 32→44 display headline (two sizes); a 17/28 lede' },
  'components/public/support/SupportPage.tsx': { count: 3, reason: 'responsive 32→44 display headline (two sizes); a 17/28 lede' },
  'components/shared/ChainBadge.tsx': { count: 2, reason: '11px pill with leading-none and an 8px glyph in a 14px disc' },
  'components/ui/Button.tsx': { count: 1, reason: 'the sm label is 14/18 — button geometry is #64, tokenised with the heights' },
  'components/ui/Kbd.tsx': { count: 1, reason: '10/16 key cap — smaller than the caption atom on purpose' },
  'components/wallet/WalletBalanceGrid.tsx': { count: 1, reason: '28/32 mono balance figure' },
  'components/wallet/intent/IntentStatusPanel.tsx': { count: 1, reason: '26/30 mono amount figure' },
  'components/wallet/sell/MoneyField.tsx': { count: 1, reason: '26/32 mono amount input' },
}

const ROOTS = ['app', 'components', 'lib', 'hooks']
// Decimal sizes too: `text-[14.5px]` is the chat bubble's, and an integer-only
// pattern let eight of those (six files) through the first cut of this register.
const PIXEL_SIZE = /text-\[[\d.]+px\]/g

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') out.push(...sourceFiles(full))
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function pixelSizeCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const root of ROOTS) {
    for (const file of sourceFiles(join(WEB_ROOT, root))) {
      const hits = readFileSync(file, 'utf8').match(PIXEL_SIZE)
      if (hits !== null) counts[relative(WEB_ROOT, file)] = hits.length
    }
  }
  return counts
}

describe('ad-hoc text sizes', () => {
  it('survive only in the register, at the counts it names', () => {
    const found = pixelSizeCounts()
    const expected = Object.fromEntries(Object.entries(OFF_SCALE).map(([file, { count }]) => [file, count]))
    // Reported as a diff of files, so a failure names the file that grew a
    // pixel size — not a bare "objects differ".
    expect(found).toEqual(expected)
  })

  it('has no stale entries — a register may not outlive the use it excuses', () => {
    for (const file of Object.keys(OFF_SCALE)) {
      expect(existsSync(join(WEB_ROOT, file)), file).toBe(true)
    }
  })

  it('gives every excused use a REASON, not just a count', () => {
    const unexplained = Object.entries(OFF_SCALE)
      .filter(([, { reason }]) => reason.trim().length <= 20)
      .map(([file]) => file)
    expect(unexplained).toEqual([])
  })
})

describe('an override beside an atom wins', () => {
  let css = ''

  beforeAll(async () => {
    expect(existsSync(GLOBALS), `globals.css not found at ${GLOBALS}`).toBe(true)
    const require_ = createRequire(WEB_ROOT)
    const postcss = require_('postcss')
    const tailwind = require_('@tailwindcss/postcss')
    // Listed one per @source: a brace list DROPS the alternatives that carry
    // a digit (measured on the real build — #59's trap), and the names here
    // are chosen without one anyway so the list stays honest either way.
    const names = ['type-body-small', 'type-title', 'font-semibold', 'font-normal', 'font-numeric', 'font-display', 'tracking-wide']
    const source = `${readFileSync(GLOBALS, 'utf8')}\n${names.map((n) => `@source inline("${n}");`).join('\n')}\n`
    css = (await postcss([tailwind()]).process(source, { from: GLOBALS })).css
  }, 60_000)

  const at = (selector: string) => {
    const index = css.indexOf(`.${selector}{`) === -1 ? css.indexOf(`.${selector} {`) : css.indexOf(`.${selector}{`)
    expect(index, `${selector} not emitted`).toBeGreaterThan(-1)
    return index
  }

  it.each([
    ['font-semibold', 'a weight override'],
    ['font-normal', 'a regular weight on a 600 atom'],
    ['font-numeric', 'the mono family on a body atom'],
    ['font-display', 'the display face on the title atom'],
    ['tracking-wide', 'a letter-spacing override'],
  ])('%s sorts after the atoms — %s', (utility) => {
    expect(at(utility)).toBeGreaterThan(at('type-body-small'))
    expect(at(utility)).toBeGreaterThan(at('type-title'))
  })
})
