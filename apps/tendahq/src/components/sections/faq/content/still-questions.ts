import { APP_INFO } from '@/content'

export const STILL_QUESTIONS = {
  title: 'Still have a question?',
  body: 'Real humans on the other side. Most answers in under 4h. Anything technical → docs. Anything broken → support.',
  links: [
    { label: 'X · @tendahq', href: APP_INFO.twitterUrl  },
    { label: 'Telegram',     href: APP_INFO.telegramUrl },
  ],
} as const
