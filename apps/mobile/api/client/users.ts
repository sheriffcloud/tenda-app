import {
  apiRoutes,
  type EscrowListRow,
  type GetUserReviewsQuery,
  type MeResponse,
  type MyStandingResponse,
  type PaginatedResponse,
  type PublicUser,
  type Review,
  type UpdateMeInput,
  type UpdateMeResponse,
  type UpdateUserInput,
  type User,
  type UserEscrowsQuery,
  type UserEscrowTransaction,
  type UserStandingResponse,
  type UserTransactionsQuery,
  type UserTransactionsSummary,
} from '@tenda/shared'
import { request } from '../request'

const { users } = apiRoutes

export const usersApi = {
  me: () => request<MeResponse>('GET', users.me),
  updateMe: (body: UpdateMeInput) => request<UpdateMeResponse>('PATCH', users.updateMe, { body }),
  myStanding: () => request<MyStandingResponse>('GET', users.myStanding),
  standing: (params: { id: string }) =>
    request<UserStandingResponse>('GET', users.standing, { params }),
  get: (params: { id: string }) => request<PublicUser>('GET', users.get, { params }),
  update: (params: { id: string }, body: UpdateUserInput) =>
    request<User>('PATCH', users.update, { params, body }),
  escrows: (params: { id: string }, query?: UserEscrowsQuery) =>
    request<PaginatedResponse<EscrowListRow>>('GET', users.escrows, { params, query }),
  reviews: (params: { id: string }, query?: GetUserReviewsQuery) =>
    request<PaginatedResponse<Review>>('GET', users.reviews, { params, query }),
  transactions: (params: { id: string }, query?: UserTransactionsQuery) =>
    request<PaginatedResponse<UserEscrowTransaction>>('GET', users.transactions, {
      params,
      query,
    }),
  // Lifetime USDC totals as a server-side aggregate — deliberately NOT
  // derived from the paginated feed above (open_issues MB1).
  transactionsSummary: (params: { id: string }) =>
    request<UserTransactionsSummary>('GET', users.transactionsSummary, { params }),
}
