'use client'
import { useParams } from 'next/navigation'
import { OpenGigDetail } from '@/components/gigs'
export default function OpenGigPage() {
  const { escrowId } = useParams<{ escrowId: string }>()
  return <OpenGigDetail escrowId={escrowId} />
}
