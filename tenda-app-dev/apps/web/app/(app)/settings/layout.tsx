import type { ReactNode } from 'react'
import { SettingsNavigation } from '@/components/settings/SettingsNavigation'

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full">
      <SettingsNavigation />
      <div className="px-4 pb-12 pt-5 sm:px-6 sm:pt-7 lg:px-8">{children}</div>
    </div>
  )
}
