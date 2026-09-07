import type { Metadata } from 'next'
import { SUPPORT_GLOSSARY } from '@tenda/shared'
import { SupportTopicPage, supportTopicMetadata } from '@/components/public/support'

export const metadata: Metadata = supportTopicMetadata('glossary')

export default function GlossaryPage() {
  return (
    <SupportTopicPage slug="glossary">
      {/* A definition list, because that is what this is — the terms are the
          navigable thing here, so they are <dt> rather than card headings. */}
      <dl className="max-w-[66ch] border-t border-border-default">
        {SUPPORT_GLOSSARY.map((entry) => (
          <div key={entry.term} className="border-b border-border-default py-5">
            <dt className="break-words font-display type-title text-content-primary">
              {entry.term}
            </dt>
            <dd className="mt-1.5 break-words type-body text-content-secondary">
              {entry.definition}
            </dd>
          </div>
        ))}
      </dl>
    </SupportTopicPage>
  )
}
