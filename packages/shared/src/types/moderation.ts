import type { ReportContentType, ReportReason } from '../constants/moderation'

export interface CreateReportInput {
  content_type: ReportContentType
  content_id:   string
  reason:        ReportReason
  note?:         string
}
