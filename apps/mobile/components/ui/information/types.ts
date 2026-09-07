import type { NoticeTone } from '@/components/ui/NoticeBanner'

/** Copy contract shared by compact notices and their full explanation. */
export interface ExpandableNoticeContent {
  summary: string
  title: string
  description: string
  tone: NoticeTone
}
