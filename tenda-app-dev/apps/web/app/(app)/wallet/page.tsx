import type { Metadata } from 'next'
import { WalletScreen } from '@/components/wallet/WalletScreen'

export const metadata: Metadata = {
  title: 'Wallet',
  robots: { index: false },
}

export default function WalletPage() {
  return <WalletScreen />
}
