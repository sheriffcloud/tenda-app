import type { Metadata } from 'next'
import { TokenApprovalsPanel } from '@/components/settings/TokenApprovalsPanel'

export const metadata: Metadata = {
  title: 'Token approvals',
  robots: { index: false },
}

export default function TokenApprovalsPage() {
  return <TokenApprovalsPanel />
}
