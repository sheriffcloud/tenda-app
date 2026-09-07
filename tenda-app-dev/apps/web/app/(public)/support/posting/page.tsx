/**
 * Public SSR over the SHARED guide copy — one wording, every surface; the
 * mobile screen renders the same sections.
 */
import type { Metadata } from 'next'
import { SUPPORT_GUIDE_POSTING } from '@tenda/shared'
import {
  GuideSteps,
  SupportAccordion,
  SupportTopicPage,
  supportTopicMetadata,
} from '@/components/public/support'

export const metadata: Metadata = supportTopicMetadata('posting')

export default function Guide() {
  return (
    <SupportTopicPage slug="posting">
      <div className="flex max-w-[72ch] flex-col gap-3">
        {SUPPORT_GUIDE_POSTING.map((section, index) => (
          <SupportAccordion key={section.title} title={section.title} defaultOpen={index === 0}>
            <GuideSteps steps={section.steps} />
          </SupportAccordion>
        ))}
      </div>
    </SupportTopicPage>
  )
}
