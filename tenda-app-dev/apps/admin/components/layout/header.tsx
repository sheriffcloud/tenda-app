'use client'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { MoonIcon, SunIcon } from 'lucide-react'
import { useAdminTheme } from '@/providers/theme'
import { Button } from '@/components/ui/button'

interface AppHeaderProps {
  title: string
}

export function AppHeader({ title }: AppHeaderProps) {
  const { resolvedTheme, setTheme } = useAdminTheme()

  return (
    <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <h1 className="flex-1 text-base font-semibold">{title}</h1>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        aria-label="Toggle theme"
      >
        {resolvedTheme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
      </Button>
    </header>
  )
}
