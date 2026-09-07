import type { ReactNode } from 'react'
import { GuestOnlyGate } from '@/components/app/GuestOnlyGate'

export default function SignInLayout({ children }: { children: ReactNode }) {
  return <GuestOnlyGate>{children}</GuestOnlyGate>
}
