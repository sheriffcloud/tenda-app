'use client'

/**
 * Mediation thread (#91) — polls GET /v1/escrows/:id/dispute/messages on a
 * recursive setTimeout. Cursor rules live in lib/dispute-thread.ts: the
 * server cursor is INCLUSIVE (gte), so merges dedupe by id and the cursor
 * advances ONLY from fetched batches (never from local sends).
 *
 * Posting requires holding the claim (server 403s otherwise); resolved
 * threads are read-only (server 409). RESOLUTION itself is deliberately
 * NOT here: it is an on-chain transaction signed by the dispute-admin key
 * via the party-facing flow (POST /v1/escrows/:id/resolve builds the
 * unsigned tx) — the dashboard documents the hand-off instead of
 * duplicating a signing surface it has no wallet for.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  resolveDisputeSender,
  type DisputeMessage,
  type DisputeSender,
  type DossierParty,
  type EscrowKind,
} from '@tenda/shared'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ProofTile } from '@/components/disputes/dossier/proofs-gallery'
import { formatAdminDateTime } from '@/lib/date-format'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { useSessionUser } from '@/lib/use-session'
import { mergeMessages, nextCursor } from '@/lib/dispute-thread'

/** Exported so tests advance timers by the real interval, never a magic number. */
export const POLL_INTERVAL_MS = 5_000

interface ThreadViewProps {
  escrowId: string
  /** Called with the latest assignee so the header stays in sync. */
  onAssignee: (assignedToId: string | null, readOnly: boolean) => void
  /** Escrow kind — drives kind-aware party labels (Poster/Worker vs Maker/Taker). */
  kind: EscrowKind
  /** Parties to the escrow, from the dossier — labels non-mediator senders. */
  parties: DossierParty[]
}

export function ThreadView({ escrowId, onAssignee, kind, parties }: ThreadViewProps) {
  const meId = useSessionUser()?.id ?? ''
  const [messages, setMessages] = useState<DisputeMessage[]>([])
  const [readOnly, setReadOnly] = useState(false)
  const [assignedToId, setAssignedToId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const cursorRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const poll = useCallback(async () => {
    try {
      const res = await adminApi.disputeThread.get(escrowId, cursorRef.current ?? undefined)
      cursorRef.current = nextCursor(cursorRef.current, res.messages)
      setMessages((prev) => mergeMessages(prev, res.messages))
      setReadOnly(res.read_only)
      setAssignedToId(res.assigned_to_id)
      onAssignee(res.assigned_to_id, res.read_only)
    } catch {
      // transient — next tick retries; auth failures bounce via lib/api
    }
  }, [escrowId, onAssignee])

  useEffect(() => {
    let cancelled = false
    async function tick() {
      await poll()
      if (!cancelled) timerRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS)
    }
    void tick()
    return () => {
      cancelled = true
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [poll])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (body === '') return
    setSending(true)
    try {
      const sent = await adminApi.disputeThread.send(escrowId, body)
      // Local append only — the CURSOR is untouched (rule 2).
      setMessages((prev) => mergeMessages(prev, [sent]))
      setDraft('')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DISPUTE_RESOLVED') {
        toast.error('Dispute resolved — the thread is read-only')
        setReadOnly(true)
      } else if (err instanceof ApiError && err.status === 403) {
        toast.error('Claim the dispute before posting')
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Send failed')
      }
    } finally {
      setSending(false)
    }
  }

  const canPost = !readOnly && assignedToId === meId

  /**
   * Sender identity comes from the shared resolver, which keys off party
   * MEMBERSHIP rather than the current assignee. That matters twice here: an
   * admin who is themselves a disputant is no longer dressed up as the
   * neutral mediator, and a mediator who has since handed the claim on still
   * reads as "Mediator" instead of falling through to "Participant".
   */
  function senderOf(senderId: string): DisputeSender {
    return resolveDisputeSender({ senderId, viewerId: meId, kind, parties })
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex-1 space-y-2 overflow-y-auto rounded-md border p-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        )}
        {messages.map((m) => {
          // One resolution per message: alignment and label must never
          // disagree about whose bubble this is.
          const sender = senderOf(m.sender_id)
          const mine = sender.kind === 'me'
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <span className="mb-0.5 px-1 text-[10px] font-medium text-muted-foreground">
                {sender.label}
              </span>
              <div
                className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                  mine ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                {m.attachment_url !== null && m.attachment_type !== null && (
                  <div className="mb-1">
                    <ProofTile
                      url={m.attachment_url}
                      type={m.attachment_type === 'image' ? 'image' : 'document'}
                      label={m.attachment_type === 'image' ? 'Image evidence' : 'Document evidence'}
                    />
                  </div>
                )}
                {m.body.length > 0 && (
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                )}
                <p className="mt-1 text-[10px] opacity-70">
                  {formatAdminDateTime(m.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {readOnly ? (
        <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
          Dispute resolved — this thread is frozen. Resolution is executed on-chain by the
          dispute-admin key via the escrow resolve flow, not from this dashboard.
        </p>
      ) : (
        <form onSubmit={handleSend} className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={canPost ? 'Write to both parties…' : 'Claim the dispute to post'}
            disabled={!canPost || sending}
            rows={2}
            className="flex-1"
          />
          <Button type="submit" disabled={!canPost || sending || draft.trim() === ''}>
            Send
          </Button>
        </form>
      )}
    </div>
  )
}
