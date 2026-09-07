'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  ScaleIcon,
  GavelIcon,
  BarChart2Icon,
  BriefcaseIcon,
  UsersIcon,
  StarIcon,
  ShieldAlertIcon,
  MegaphoneIcon,
  BellIcon,
  DollarSignIcon,
  ActivityIcon,
  BanknoteIcon,
  SettingsIcon,
  LogOutIcon,
  type LucideIcon,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { clearSession } from '@/lib/auth'
import { useSessionUser } from '@/lib/use-session'
import { visibleNav } from '@/lib/nav'
import { DisputeQueueBadge } from './dispute-queue-badge'

/** The one nav item that carries a live count. */
const DISPUTES_HREF = '/disputes'

// Icons keyed by href — lib/nav.ts stays UI-free so node:test can load it.
const NAV_ICONS: Record<string, LucideIcon> = {
  '/disputes': ScaleIcon,
  '/resolutions': GavelIcon,
  '/reports': BarChart2Icon,
  '/escrows': BriefcaseIcon,
  '/users': UsersIcon,
  '/featured': StarIcon,
  '/moderation': ShieldAlertIcon,
  '/announcements': MegaphoneIcon,
  '/push': BellIcon,
  '/finance': DollarSignIcon,
  '/metrics': ActivityIcon,
  '/fiat': BanknoteIcon,
  '/config': SettingsIcon,
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  // useSyncExternalStore: SSR renders an empty menu, the client snapshot
  // fills it post-hydration, storage events keep tabs in sync.
  const user = useSessionUser()

  const items = user === null ? [] : visibleNav(user.role)

  function handleSignOut() {
    clearSession()
    router.push('/login')
  }

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-5">
        <span className="text-lg font-bold tracking-tight">Tenda Admin</span>
        {user !== null && (
          <span className="text-xs text-muted-foreground">
            {user.first_name} {user.last_name} · {user.role}
          </span>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarMenu>
            {items.map(({ href, label }) => {
              const Icon = NAV_ICONS[href]
              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(href)}>
                    <Link href={href}>
                      {Icon !== undefined && <Icon size={18} />}
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {/* Rendered from inside this loop rather than beside it, so
                      the badge only exists when `visibleNav` emitted the item
                      — i.e. only for a role with `disputes.read`. That is what
                      keeps the poll from firing a request the API would 403,
                      without a second permission check to drift from the
                      first. */}
                  {href === DISPUTES_HREF && <DisputeQueueBadge />}
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut}>
              <LogOutIcon size={18} />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
