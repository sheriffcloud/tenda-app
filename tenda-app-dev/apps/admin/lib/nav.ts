/**
 * Permission-driven navigation (#90). Every item carries the Permission
 * its page needs; visibleNav filters through the SAME shared
 * ROLE_PERMISSIONS map the server guards use, so the sidebar can never
 * show a surface the API would 403.
 */
import { hasPermission, type Permission } from '@tenda/shared'

export interface NavItem {
  href: string
  label: string
  permission: Permission
}

// Ordered by the dashboard build order (#91 → #93) then ops tail.
export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: '/disputes', label: 'Disputes', permission: 'disputes.read' },
  { href: '/resolutions', label: 'Resolutions', permission: 'disputes.execute' },
  { href: '/reports', label: 'Reports', permission: 'reports.read' },
  { href: '/escrows', label: 'Listings', permission: 'escrows.read' },
  { href: '/users', label: 'Users', permission: 'users.read' },
  { href: '/featured', label: 'Featured', permission: 'escrows.feature' },
  { href: '/moderation', label: 'Moderation', permission: 'moderation.read' },
  { href: '/announcements', label: 'Announcements', permission: 'announcements.read' },
  { href: '/push', label: 'Push', permission: 'push.broadcast' },
  { href: '/finance', label: 'Finance', permission: 'finance.read' },
  { href: '/metrics', label: 'Metrics', permission: 'metrics.read' },
  { href: '/fiat', label: 'Fiat Rails', permission: 'fiat.read' },
  { href: '/config', label: 'Platform Config', permission: 'config.read' },
]

export function visibleNav(role: string): NavItem[] {
  return NAV_ITEMS.filter((item) => hasPermission(role, item.permission))
}
