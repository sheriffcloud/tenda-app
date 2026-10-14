import { SectionShell, type LandingSectionProps } from '@/components/ui/SectionShell'
import { Period, SectionHead, SectionRule } from '@/components/ui/SectionRule'
import { FAQ_CATEGORIES, FAQ_HEADER } from './content'
import { FaqList } from './FaqList'

/**
 * §07 FAQ — ONE ruled list. The five category blocks of the previous
 * layout are flattened: each question carries its category as an eyebrow
 * in the left margin, the way the Paper Landing tags its questions, so the
 * page reads as an index rather than as five products.
 */
export function FAQ({ surface }: LandingSectionProps) {
  return (
    <SectionShell id="faq" surface={surface}>
      <SectionRule title={FAQ_HEADER.eyebrow} aside={FAQ_HEADER.aside} />
      <SectionHead lede={FAQ_HEADER.sub}>
        {FAQ_HEADER.h2.lead}<Period />
        <br />
        <span className="text-[var(--content-tertiary)]">{FAQ_HEADER.h2.dim}</span>
      </SectionHead>

      <FaqList categories={FAQ_CATEGORIES} />
    </SectionShell>
  )
}
