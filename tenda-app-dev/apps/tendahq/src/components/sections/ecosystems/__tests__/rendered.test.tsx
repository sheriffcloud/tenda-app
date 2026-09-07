import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { asText } from '@/test-support/html-text'
import {
  chainByFamily,
  ECOSYSTEM_PANELS,
  ECOSYSTEMS_HEADER,
  explorerHost,
  PROOF_LABELS,
  transportFor,
} from '@/content'
import { EcosystemPanel } from '../EcosystemPanel'
import { Ecosystems } from '../Ecosystems'

const html = renderToStaticMarkup(<Ecosystems surface="alt" />)
const [first] = ECOSYSTEM_PANELS

const panelHtml = (family: string) => {
  const panel = ECOSYSTEM_PANELS.find((p) => p.chainFamily === family)
  if (panel === undefined) throw new Error(`no panel for ${family}`)
  return renderToStaticMarkup(<EcosystemPanel panel={panel} id="p" labelledBy="t" />)
}

describe('§06 ecosystems', () => {
  it('offers one tab per panel, exactly one selected, wired to the one panel', () => {
    expect(html.match(/role="tab"/g)).toHaveLength(ECOSYSTEM_PANELS.length)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html).toContain(`aria-label="${ECOSYSTEMS_HEADER.railLabel}"`)
    expect(html).toContain(
      `role="tabpanel" id="ecosystem-panel" aria-labelledby="ecosystem-tab-${first.chainFamily}"`,
    )
  })

  it('marks a roadmap proof as not shipped, and only those', () => {
    // The section's honesty rule: every proof point is shipped or says it is
    // not. A pill on a shipped row overstates nothing but a missing pill on
    // a roadmap row is exactly the claim this section exists to avoid.
    const withRoadmap = ECOSYSTEM_PANELS.find((p) => p.proofs.some((x) => x.roadmap))
    const without = ECOSYSTEM_PANELS.find((p) => p.proofs.every((x) => !x.roadmap))
    expect(withRoadmap).toBeDefined()
    expect(without).toBeDefined()
    if (withRoadmap === undefined || without === undefined) return
    const flagged = panelHtml(withRoadmap.chainFamily)
    const roadmapCount = withRoadmap.proofs.filter((x) => x.roadmap).length
    expect(flagged.match(new RegExp(`>${PROOF_LABELS.roadmap}<`, 'g'))).toHaveLength(roadmapCount)
    expect(panelHtml(without.chainFamily)).not.toContain(`>${PROOF_LABELS.roadmap}<`)
    for (const proof of withRoadmap.proofs) expect(flagged).toContain(asText(proof.label))
  })

  it('prints the reference facts of the chain it shows, from the manifest', () => {
    const chain = chainByFamily(first.chainFamily)
    expect(chain).toBeDefined()
    if (chain === undefined) return
    expect(html).toContain(`<code class="truncate">${chain.id}</code>`)
    expect(html).toContain(chain.nativeSymbol)
    expect(html).toContain(transportFor(chain.namespace))
    if (chain.explorerUrl !== undefined) {
      expect(html).toContain(`href="${chain.explorerUrl}"`)
      expect(html).toContain(explorerHost(chain.explorerUrl))
    }
  })
})
