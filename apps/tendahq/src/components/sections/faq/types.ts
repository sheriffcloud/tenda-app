import type { ReactNode } from 'react'

export interface FaqQuestion {
  id: string                // 'Q.01' .. 'Q.15'
  question: string
  answer: ReactNode
}

export interface FaqCategory {
  num: '01' | '02' | '03' | '04' | '05'
  slug: 'trust' | 'money' | 'disputes' | 'crypto' | 'coverage'
  title: string
  caption: string
  questions: readonly FaqQuestion[]
}
