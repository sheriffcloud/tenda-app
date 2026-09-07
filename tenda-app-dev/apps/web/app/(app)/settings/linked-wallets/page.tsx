import type { Metadata } from 'next'
import { LinkedWalletsPanel } from '@/components/settings/LinkedWalletsPanel'

export const metadata: Metadata = {
  title: 'Linked wallets',
  robots: { index: false },
}

export default function LinkedWalletsPage() {
  return <LinkedWalletsPanel />
}
