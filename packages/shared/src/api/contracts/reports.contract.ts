import type { Endpoint } from '../endpoint'
import type { CreateReportInput } from '../../types'

export interface ReportsContract {
  create: Endpoint<'POST', undefined, CreateReportInput, undefined, { id: string }>
}
