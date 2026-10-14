import type { Metadata } from 'next'
import { SupportFaqList, SupportTopicPage, supportTopicMetadata } from '@/components/public/support'

export const metadata: Metadata = supportTopicMetadata('faq')

export default function FaqPage() {
  return (
    <SupportTopicPage slug="faq">
      <SupportFaqList />
    </SupportTopicPage>
  )
}
