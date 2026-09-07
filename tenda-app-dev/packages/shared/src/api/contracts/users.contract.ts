import type { Endpoint } from '../endpoint'
import type {
  User,
  PublicUser,
  UpdateUserInput,
  UserTransactionsQuery,
  UserTransactionsSummary,
  PaginatedResponse,
  EscrowListRow,
  UserEscrowTransaction,
  UserEscrowsQuery,
} from '../../types'
import type { Review, GetUserReviewsQuery } from '../../types/review'
import type { GigCategory } from '../../constants/categories'
import type { LinkedWallet } from './auth.contract'
import type { RestrictionKind } from '../../db/schema/reputation'

// ---------- Stage 7: standing (#57/#58) ------------------------------------

export type { RestrictionKind }

/** GET /v1/users/:id/standing — rolled-up public signals only. */
export interface UserStandingResponse {
  /** Null below the cold-start floor — UI shows "New user". */
  completion_rate: number | null
  completed_count: number
  /** True for restrictions visible to other users ("limited account"). */
  is_limited: boolean
  /** Numeric(3,2) — serialized as a string by the driver, null if unrated. */
  review_score: string | null
  /** ISO-8601 account creation, null for legacy rows. */
  member_since: string | null
}

export interface MyRestriction {
  kind: RestrictionKind
  /** ISO-8601; null = indefinite (manual_review). */
  until: string | null
  reason: string
}

/** GET /v1/users/me/standing — own view, including the active restriction. */
export interface MyStandingResponse {
  completion_rate: number | null
  completed_count: number
  is_limited: boolean
  restriction: MyRestriction | null
}

// ---------- completed work by category (#33) --------------------------------

/** One chip in the profile's "Work you have done" block. */
export interface CompletedWorkCategory {
  category: GigCategory
  count: number
}

/**
 * GET /v1/users/:id/completed-work — the categories a user has actually
 * delivered in, with how many times.
 *
 * WHICH POPULATION. Escrows the user WORKED (`isEscrowCounterpartySide`) that
 * reached `completed` — the same predicate behind the profile's "Completed"
 * stat (`GET /v1/gigs?mine=working&status=completed`), so the chips sum to the
 * number printed beside them. Counting gigs POSTED would put two figures that
 * disagree on one page.
 *
 * ONLY CATEGORIES WITH WORK, most first. Unlike `GigFacets`, which is complete
 * over its vocabulary because the feed rail draws a cell either way, a chip
 * exists BECAUSE there is work behind it — so an empty `data` is what "no
 * completed work yet" looks like, and the block renders nothing rather than a
 * row of zeros.
 *
 * PUBLIC, like `GET /v1/users/:id/standing`, which already serves a stranger a
 * `completed_count`. Rolled up only: no escrow id, no counterparty, no amount,
 * no title.
 */
export interface CompletedWorkResponse {
  data: CompletedWorkCategory[]
}

// ---------- Stage 1: /v1/users/me (#38) -----------------------------------

/**
 * The v2 public column set GET/PATCH /v1/users/me returns — a subset of
 * the physical `users` row (no phone_e164, no wallet_address). Dates are
 * ISO-serialized by Fastify.
 */
export interface MeUser {
  id: string
  first_name: string
  last_name: string
  bio: string | null
  avatar_url: string | null
  country: string | null
  city: string | null
  phone_verified_at: string | null
  role: string
  is_seeker: boolean
  advanced_mode_enabled: boolean
  created_at: string
}

export interface MeResponse {
  user: MeUser
  wallets: LinkedWallet[]
  /** first_name AND last_name set — mirrors requireProfileComplete. */
  profile_complete: boolean
}

/**
 * PATCH /v1/users/me — phone changes ride the OTP routes, never here.
 * is_seeker is deliberately absent: the Seeker DEVICE fee-tier flag is
 * written once by the signup bootstrap (auth verify), never by PATCH.
 */
export interface UpdateMeInput {
  first_name?: string
  last_name?: string
  country?: string
  city?: string
  bio?: string
  avatar_url?: string
  /** CO4: unlocks the P2P exchange surface (order book + offer creation). */
  advanced_mode_enabled?: boolean
}

export interface UpdateMeResponse {
  user: MeUser
  profile_complete: boolean
}

export interface UsersContract {
  me:             Endpoint<'GET', undefined, undefined,        undefined,                  MeResponse>
  updateMe:       Endpoint<'PATCH', undefined, UpdateMeInput,  undefined,                  UpdateMeResponse>
  myStanding:     Endpoint<'GET', undefined, undefined,        undefined,                  MyStandingResponse>
  standing:       Endpoint<'GET', { id: string }, undefined,   undefined,                  UserStandingResponse>
  completedWork:  Endpoint<'GET', { id: string }, undefined,   undefined,                  CompletedWorkResponse>
  get:            Endpoint<'GET', { id: string }, undefined,        undefined,                  PublicUser>
  update:         Endpoint<'PUT', { id: string }, UpdateUserInput,  undefined,                  User>
  escrows:        Endpoint<'GET', { id: string }, undefined,        UserEscrowsQuery,           PaginatedResponse<EscrowListRow>>
  reviews:        Endpoint<'GET', { id: string }, undefined,        GetUserReviewsQuery,        PaginatedResponse<Review>>
  transactions:   Endpoint<'GET', { id: string }, undefined,        UserTransactionsQuery,      PaginatedResponse<UserEscrowTransaction>>
  transactionsSummary: Endpoint<'GET', { id: string }, undefined,   undefined,                  UserTransactionsSummary>
}
