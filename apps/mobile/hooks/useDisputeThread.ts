import { useCallback, useEffect, useRef, useState } from 'react'
import type { DisputeMessage, DisputeThreadResponse } from '@tenda/shared'
import { api } from '@/api/client'
import type { UploadedAttachment } from '@/lib/attachments'
import { classifyDisputeSendError, type DisputeSendResult } from '@/lib/dispute-send-error'

const POLL_INTERVAL_MS = 4_000
const POLL_IDLE_MS = 10_000
const EMPTY_POLL_LIMIT = 3

export interface DisputeThreadState {
  loading: boolean
  error: string | null
  thread: Omit<DisputeThreadResponse, 'messages'> | null
  messages: DisputeMessage[]
  /**
   * Append a message (optionally with an attachment). Reports WHY a send was
   * refused: only `failed` is worth retrying, and the caller needs to tell
   * those apart to avoid inviting a retry that can never succeed.
   */
  send: (body: string, attachment?: UploadedAttachment) => Promise<DisputeSendResult>
  /** Manual refresh (pull-to-refresh / retry). */
  reload: () => Promise<void>
}

/**
 * Loads the CO7 dispute thread for an escrow, then tails it with the
 * project-standard recursive-setTimeout poll (backs off after 3 empty
 * polls, same cadence as chat's useMessagePolling).
 */
export function useDisputeThread(escrowId: string | null): DisputeThreadState {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [thread, setThread] = useState<Omit<DisputeThreadResponse, 'messages'> | null>(null)
  const [messages, setMessages] = useState<DisputeMessage[]>([])

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emptyPollCount = useRef(0)
  const isFetching = useRef(false)
  const lastSeenAt = useRef<string | null>(null)

  /**
   * Merge a batch into the list (id-deduped). Only SERVER batches advance
   * the poll cursor, advancing it from our own send() would skip any
   * counterparty message timestamped between our last poll and the send
   * (it would sort before the cursor and never be fetched again). The
   * sent message re-arrives on the next poll and dedupes away.
   */
  const applyBatch = useCallback((incoming: DisputeMessage[], advanceCursor: boolean) => {
    if (incoming.length === 0) return 0
    let appended = 0
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id))
      const fresh = incoming.filter((m) => !seen.has(m.id))
      appended = fresh.length
      if (fresh.length === 0) return prev
      // Re-sort: a just-sent message lands before older counterparty
      // messages the next poll backfills.
      return [...prev, ...fresh].sort((a, b) =>
        a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at),
      )
    })
    if (advanceCursor) {
      const last = incoming[incoming.length - 1]
      if (lastSeenAt.current === null || last.created_at > lastSeenAt.current) {
        lastSeenAt.current = last.created_at
      }
    }
    return appended
  }, [])

  const load = useCallback(
    async (tail: boolean) => {
      if (escrowId === null) return
      const { messages: batch, ...meta } = await api.escrows.disputeThread(
        { id: escrowId },
        tail && lastSeenAt.current !== null ? { after: lastSeenAt.current } : undefined,
      )
      // Context rides only the full load; keep the first copy through the
      // context-less tail polls instead of blanking the header every 4s.
      setThread((prev) => ({ ...meta, context: meta.context ?? prev?.context ?? null }))
      const appended = applyBatch(batch, true)
      emptyPollCount.current = appended === 0 ? emptyPollCount.current + 1 : 0
    },
    [escrowId, applyBatch],
  )

  const scheduleNextPoll = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current)
    const delay = emptyPollCount.current >= EMPTY_POLL_LIMIT ? POLL_IDLE_MS : POLL_INTERVAL_MS
    pollTimer.current = setTimeout(async () => {
      if (!isFetching.current) {
        isFetching.current = true
        try {
          await load(true)
        } catch {
          // Poll errors are silent, the next cycle retries.
        } finally {
          isFetching.current = false
        }
      }
      scheduleNextPoll()
    }, delay)
  }, [load])

  const reload = useCallback(async () => {
    setError(null)
    setLoading(true)
    lastSeenAt.current = null
    setMessages([])
    try {
      await load(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the dispute thread')
    } finally {
      setLoading(false)
    }
  }, [load])

  const send = useCallback(
    async (body: string, attachment?: UploadedAttachment): Promise<DisputeSendResult> => {
      if (escrowId === null) return 'failed'
      try {
        const message = await api.escrows.sendDisputeMessage(
          { id: escrowId },
          attachment !== undefined
            ? {
                body,
                attachment_url: attachment.url,
                attachment_type: attachment.type,
                attachment_size: attachment.size,
              }
            : { body },
        )
        applyBatch([message], false)
        return 'sent'
      } catch (err) {
        const failure = classifyDisputeSendError(err)
        // The server has already frozen this thread; freeze ours too rather
        // than waiting for a poll, so the composer goes away with the toast.
        if (failure === 'resolved') {
          setThread((prev) => (prev === null ? prev : { ...prev, read_only: true }))
        }
        return failure
      }
    },
    [escrowId, applyBatch],
  )

  useEffect(() => {
    if (escrowId === null) return
    void reload()
    scheduleNextPoll()
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [escrowId, reload, scheduleNextPoll])

  return { loading, error, thread, messages, send, reload }
}
