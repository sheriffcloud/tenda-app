import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import type { reviews } from '../db/schema'

export type Review    = InferSelectModel<typeof reviews>
export type NewReview = InferInsertModel<typeof reviews>

export interface ReviewInput {
  score:    1 | 2 | 3 | 4 | 5
  comment?: string
}

export type GetUserReviewsQuery = {
  limit?:  number
  offset?: number
}
