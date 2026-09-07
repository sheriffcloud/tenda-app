import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WEB_APP_LINK } from '@/components/layout/nav-content'
import { FinalCTA } from '../FinalCTA'
import { DOWNLOAD_BUTTONS, FINAL_CTA_HEADER, RECEIPTS } from '../content'

const html = renderToStaticMarkup(<FinalCTA surface="base" />)

describe('§08 the closer', () => {
  it('opens on its rule and both headline lines', () => {
    expect(html).toContain(FINAL_CTA_HEADER.eyebrow)
    for (const line of FINAL_CTA_HEADER.h2) expect(html).toContain(line)
    expect(html).toContain(FINAL_CTA_HEADER.sub)
  })

  it('offers the web app and the APK as live links, and each store as a disabled control', () => {
    expect(html).toContain(`href="${WEB_APP_LINK.href}"`)
    expect(html).toContain(`href="${DOWNLOAD_BUTTONS.apk.href}"`)
    for (const store of DOWNLOAD_BUTTONS.comingSoon) {
      expect(html).toContain(`${store} ${DOWNLOAD_BUTTONS.soonSuffix}`)
      expect(html).toContain(`title="${DOWNLOAD_BUTTONS.soonTitle(store)}"`)
    }
    // A store that does not exist must not be a link anyone can follow.
    expect(html.match(/<button[^>]*disabled=""[^>]*aria-disabled="true"/g)).toHaveLength(
      DOWNLOAD_BUTTONS.comingSoon.length,
    )
  })

  /**
   * A <dl> group is a term followed by its values; the value is set first
   * VISUALLY, by flex order, so the markup must not put <dd> before <dt>.
   */
  it('renders each receipt as a term that precedes its values', () => {
    for (const receipt of RECEIPTS) {
      const at = html.indexOf(`>${receipt.k}</dt>`)
      expect(at).toBeGreaterThan(-1)
      const value = html.indexOf(receipt.v, at)
      expect(value).toBeGreaterThan(at)
      expect(html.indexOf(receipt.b, at)).toBeGreaterThan(value)
    }
    expect(html.match(/<dt/g)).toHaveLength(RECEIPTS.length)
  })

  it('ends the one worded receipt on the brand period, and none of the numeric ones', () => {
    const worded = RECEIPTS.filter((r) => r.period)
    expect(worded).toHaveLength(1)
    expect(html).toContain(`${worded[0].v}<span class="text-[var(--brand-primary)]">.</span>`)
    for (const r of RECEIPTS.filter((x) => !x.period)) {
      expect(html).not.toContain(`${r.v}<span class="text-[var(--brand-primary)]">.</span>`)
    }
  })
})
