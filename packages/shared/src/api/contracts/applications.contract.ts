/**
 * The caller's own gig applications. Caller-scoped like conversations and
 * subscriptions — there is no id in the path because identity comes from the
 * JWT, never a parameter.
 */
import type { Endpoint } from '../endpoint'
import type { MyApplication, MyApplicationsQuery } from '../../types/application'
import type { PaginatedResponse } from '../../types'

export interface ApplicationsContract {
  mine: Endpoint<'GET', undefined, undefined, MyApplicationsQuery, PaginatedResponse<MyApplication>>
}
