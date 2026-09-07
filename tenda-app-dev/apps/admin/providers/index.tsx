'use client'

import { Toaster } from '@/components/ui/sonner'
import { AdminThemeProvider } from '@/providers/theme'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminThemeProvider>
      {children}
      <Toaster richColors position="top-right" />
    </AdminThemeProvider>
  )
}
