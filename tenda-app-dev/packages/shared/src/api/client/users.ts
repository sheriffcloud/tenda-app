import { apiRoutes } from '../routes'
import type {
  CompletedWorkResponse,
  EscrowListRow,
  GetUserReviewsQuery,
  MeResponse,
  MyStandingResponse,
  PaginatedResponse,
  PublicUser,
  Review,
  UpdateMeInput,
  UpdateMeResponse,
  UpdateUserInput,
  User,
  UserEscrowsQuery,
  UserEscrowTransaction,
  UserStandingResponse,
  UserTransactionsQuery,
  UserTransactionsSummary,
} from '../..'
import type { ApiRequest } from './types'

const { users } = apiRoutes

export function createUsersApi(request: ApiRequest) {
  return {
    me: () => request<MeResponse>('GET', users.me),
    updateMe: (body: UpdateMeInput) => request<UpdateMeResponse>('PATCH', users.updateMe, { body }),
    myStanding: () => request<MyStandingResponse>('GET', users.myStanding),
    standing: (params: { id: string }) =>
      request<UserStandingResponse>('GET', users.standing, { params }),
    // Categories delivered in, as a server-side GROUP BY — deliberately NOT
    // grouped from a page of the user's gigs, which is the whole reason it is
    // an endpoint (#33), and the same rule transactionsSummary follows below.
    completedWork: (params: { id: string }) =>
      request<CompletedWorkResponse>('GET', users.completedWork, { params }),
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
}
