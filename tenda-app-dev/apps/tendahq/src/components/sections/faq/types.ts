import type { ReactNode } from 'react'

export interface FaqQuestion {
  id: string                // 'Q.01' .. 'Q.15'
  question: string
  answer: ReactNode
}

export interface FaqCategory {
  /** The tag each of its questions carries in the margin. */
  title: string
  questions: readonly FaqQuestion[]
}
