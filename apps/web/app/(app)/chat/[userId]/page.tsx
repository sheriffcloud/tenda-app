'use client'

/**
 * Chat thread route — web twin of mobile's chat/[userId]. The escrow
 * context arrives as search params (mobile: route params) when the thread
 * is opened from a gig/exchange detail.
 */
import { useParams, useSearchParams } from 'next/navigation'
import { ChatThread, type ChatEscrowContext } from '@/components/chat'

export default function ChatPage() {
  const { userId } = useParams<{ userId: string }>()
  const search = useSearchParams()

  const escrowId = search.get('escrowId')
  const kindParam = search.get('kind')
  const context: ChatEscrowContext | undefined = escrowId
    ? {
        escrowId,
        escrowTitle: search.get('escrowTitle'),
        kind: kindParam === 'gig' || kindParam === 'exchange' ? kindParam : null,
      }
    : undefined

  return <ChatThread userId={userId} context={context} />
}
