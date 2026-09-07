import { useState } from 'react'
import { SectionShell, type LandingSectionProps } from '@/components/ui/SectionShell'
import { Period, SectionHead, SectionRule } from '@/components/ui/SectionRule'
import { Tab } from '@/components/ui/Tab'
import { chainByFamily, ECOSYSTEM_PANELS, ECOSYSTEMS_HEADER } from '@/content'
import { EcosystemPanel } from './EcosystemPanel'

/**
 * §06 Multichain — a CHAIN SWITCHER over ONE quiet card, identity derived from
 * the shared chain manifest. One panel, one shape, and the reader picks the
 * chain; it is the pattern §05 directly above already uses, which makes the
 * pair read as one idea instead of two solutions to the same problem.
 */
export function Ecosystems({ surface }: LandingSectionProps) {
  const [family, setFamily] = useState(ECOSYSTEM_PANELS[0].chainFamily)
  const panel = ECOSYSTEM_PANELS.find((p) => p.chainFamily === family) ?? ECOSYSTEM_PANELS[0]
  const [line1, line2] = ECOSYSTEMS_HEADER.h2

  return (
    <SectionShell id="ecosystems" surface={surface}>
      <SectionRule title={ECOSYSTEMS_HEADER.eyebrow} aside={ECOSYSTEMS_HEADER.aside} />
      <SectionHead lede={ECOSYSTEMS_HEADER.sub}>
        {line1}
        <br />
        {line2}<Period />
      </SectionHead>

      <div role="tablist" aria-label={ECOSYSTEMS_HEADER.railLabel} className="mt-[clamp(26px,3.2vw,40px)] flex flex-wrap gap-2">
        {ECOSYSTEM_PANELS.map((p) => {
          const chain = chainByFamily(p.chainFamily)
          if (chain === undefined) return null
          return (
            <Tab
              key={p.chainFamily}
              id={`ecosystem-tab-${p.chainFamily}`}
              active={p.chainFamily === family}
              controls="ecosystem-panel"
              onClick={() => setFamily(p.chainFamily)}
            >
              {/* The chain's own colour, the one place a per-chain hue is
                  allowed to appear — as a micro-glyph, never as fill. */}
              <span aria-hidden className="text-[13px] leading-none" style={{ color: chain.color }}>
                {chain.glyph}
              </span>
              {chain.name}
            </Tab>
          )
        })}
      </div>

      <EcosystemPanel
        panel={panel}
        id="ecosystem-panel"
        labelledBy={`ecosystem-tab-${panel.chainFamily}`}
      />
    </SectionShell>
  )
}
