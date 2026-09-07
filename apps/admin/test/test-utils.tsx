import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'

/**
 * Render a dashboard page. Every page mounts AppHeader → SidebarTrigger,
 * which needs the sidebar context the (dashboard) layout normally provides.
 */
export function renderPage(ui: ReactElement) {
  return render(<SidebarProvider>{ui}</SidebarProvider>)
}
