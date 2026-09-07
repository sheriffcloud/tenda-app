export const GIG_CATEGORIES = [
  'delivery',
  'photo',
  'errand',
  'service',
  'digital',
] as const

export type GigCategory = (typeof GIG_CATEGORIES)[number]
