import { APP_INFO } from '@/content'

export type SocialKey = 'whatsapp' | 'twitter' | 'telegram'

export interface SocialLink {
  key: SocialKey
  label: string
  href: string
}

/**
 * Footer socials — icon-only anchors. Order matters (left → right).
 * Icons themselves live in `<FooterSocial />` so this file stays declarative.
 * WhatsApp is intentionally hidden (2026-07-19) — re-add the row to restore.
 */
export const FOOTER_SOCIALS: readonly SocialLink[] = [
  { key: 'twitter',  label: 'X',        href: APP_INFO.twitterUrl  },
  { key: 'telegram', label: 'Telegram', href: APP_INFO.telegramUrl },
] as const
