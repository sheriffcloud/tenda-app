import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import type { reviews } from '../db/schema'

type ReviewRow = InferSelectModel<typeof reviews>

/** Review as serialized by HTTP APIs. Database timestamps never cross as Date objects. */
export type Review = Omit<ReviewRow, 'created_at'> & { created_at: string }
export type NewReview = InferInsertModel<typeof reviews>

export interface ReviewInput {
  score:    1 | 2 | 3 | 4 | 5
  comment?: string
}

export type GetUserReviewsQuery = {
  limit?:  number
  offset?: number
}
