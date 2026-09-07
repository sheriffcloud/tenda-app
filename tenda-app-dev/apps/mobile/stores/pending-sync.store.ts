/**
 * Deferred client-ping queue (post-#34 the ONLY pending-sync action).
 * The v2 flow broadcasts a wallet-signed tx, then reports the tx_ref via
 * POST /v1/blockchain/transaction; when that ping fails offline it lands
 * here and replays on foreground. Replays are idempotent server-side
 * (tx_ref UNIQUE + job dedup).
 */
import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { api } from '@/api/client'
import { ApiClientError, ErrorCode } from '@tenda/shared'
import type { EscrowTxType } from '@tenda/shared'

const STORAGE_KEY        = 'tenda_pending_sync'
const FAILED_STORAGE_KEY = 'tenda_failed_sync'
const MAX_RETRY_COUNT    = 10

export interface PendingSync {
  id: string
  action: 'escrow_ping'
  escrowId: string | null
  chainId: string
  txAction: EscrowTxType
  /** tx_ref of the already-broadcast transaction. */
  signature: string
  createdAt: number
  retryCount: number
}

/** Human-readable label for each pending-sync action. Exhaustive by type, update when adding new actions. */
export const PENDING_SYNC_ACTION_LABEL: Record<PendingSync['action'], string> = {
  escrow_ping: 'Confirm on-chain transaction',
}

type PendingSyncEntry = Omit<PendingSync, 'id' | 'createdAt' | 'retryCount'>

interface PendingSyncState {
  queue:       PendingSync[]
  /** Dead-letter queue, items that exceeded MAX_RETRY_COUNT. Signature preserved for manual recovery. */
  failed:      PendingSync[]
  /** True while replayAll is running, prevents concurrent invocations. */
  isReplaying: boolean
  add:           (entry: PendingSyncEntry) => string
  remove:        (id: string) => void
  /** Move a failed item back to the active queue with retryCount reset to 0, then replay immediately. */
  retryFailed:   (id: string) => void
  /** Permanently remove a failed item the user has acknowledged. */
  dismissFailed: (id: string) => void
  clear:         () => Promise<void>
  replayAll:     () => Promise<void>
}

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

async function loadQueue(): Promise<PendingSync[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PendingSync[]) : []
  } catch {
    return []
  }
}

async function loadFailed(): Promise<PendingSync[]> {
  try {
    const raw = await SecureStore.getItemAsync(FAILED_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PendingSync[]) : []
  } catch {
    return []
  }
}

async function saveQueue(queue: PendingSync[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // Non-fatal, in-memory state still intact
  }
}

async function saveFailed(failed: PendingSync[]): Promise<void> {
  try {
    if (failed.length === 0) {
      await SecureStore.deleteItemAsync(FAILED_STORAGE_KEY)
    } else {
      await SecureStore.setItemAsync(FAILED_STORAGE_KEY, JSON.stringify(failed))
    }
  } catch {
    // Non-fatal
  }
}

export const usePendingSyncStore = create<PendingSyncState>((set, get) => ({
  queue:       [],
  failed:      [],
  isReplaying: false,

  add: (entry: PendingSyncEntry) => {
    const id   = uuid()
    const item: PendingSync = { ...entry, id, createdAt: Date.now(), retryCount: 0 }
    const queue = [...get().queue, item]
    set({ queue })
    saveQueue(queue).catch(() => {})
    return id
  },

  remove: (id) => {
    const queue = get().queue.filter((item) => item.id !== id)
    set({ queue })
    saveQueue(queue).catch(() => {})
  },

  retryFailed: (id) => {
    const item = get().failed.find((i) => i.id === id)
    if (!item) return
    const failed = get().failed.filter((i) => i.id !== id)
    const queue  = [...get().queue, { ...item, retryCount: 0 }]
    set({ queue, failed })
    saveQueue(queue).catch(() => {})
    saveFailed(failed).catch(() => {})
    // Replay immediately so the user sees an instant retry rather than waiting
    // for the next foreground sync event.
    void get().replayAll()
  },

  dismissFailed: (id) => {
    const failed = get().failed.filter((i) => i.id !== id)
    set({ failed })
    saveFailed(failed).catch(() => {})
  },

  clear: async () => {
    set({ queue: [], failed: [] })
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEY)
      await SecureStore.deleteItemAsync(FAILED_STORAGE_KEY)
    } catch {
      // Non-fatal
    }
  },

  replayAll: async () => {
    // Re-entrancy guard, prevent concurrent invocations from processing the same items.
    if (get().isReplaying) return
    set({ isReplaying: true })

    try {
    // Merge disk state with in-memory state. In-memory is authoritative for items
    // that exist in both (e.g. retryCount just incremented). Disk-only items are
    // added back (e.g. recovered after a crash before the in-memory store hydrated).
    const [diskQueue, diskFailed] = await Promise.all([loadQueue(), loadFailed()])

    // Capture both queues once to avoid a data race where get().queue differs
    // between building memIds and building merged (e.g. add() called mid-await).
    const memQueue     = get().queue
    const memFailed    = get().failed
    const memIds       = new Set(memQueue.map((i) => i.id))
    const memFailedIds = new Set(memFailed.map((i) => i.id))
    const merged       = [...memQueue,  ...diskQueue.filter((i) => !memIds.has(i.id))]
    const mergedFailed = [...memFailed, ...diskFailed.filter((i) => !memFailedIds.has(i.id))]

    set({ queue: merged, failed: mergedFailed })

    const toProcess = [...merged]
    for (const entry of toProcess) {
      if (entry.retryCount >= MAX_RETRY_COUNT) {
        // Move to dead-letter instead of discarding, signature preserved for manual recovery.
        const queue  = get().queue.filter((i) => i.id !== entry.id)
        const failed = [...get().failed.filter((i) => i.id !== entry.id), entry]
        set({ queue, failed })
        saveQueue(queue).catch(() => {})
        saveFailed(failed).catch(() => {})
        continue
      }

      try {
        await api.blockchain.clientPing({
          tx_ref: entry.signature,
          action: entry.txAction,
          chain_id: entry.chainId,
          ...(entry.escrowId !== null ? { escrow_id: entry.escrowId } : {}),
        })
        get().remove(entry.id)
      } catch (err) {
        // DEFENSIVE: the current v2 client-ping never 409s a duplicate --
        // tx_attempts inserts with onConflictDoNothing and replays answer 202
        // {recorded:false} (server routes/v1/blockchain/transaction.ts). The
        // branch stays because DUPLICATE_SIGNATURE is still in the contract
        // enum: if a server reintroduces it, "already recorded" must read as
        // success. Matched on `code` -- `error` is the HTTP label
        // ('Conflict') and can never equal an ErrorCode.
        if (err instanceof ApiClientError && err.statusCode === 409 && err.code === ErrorCode.DUPLICATE_SIGNATURE) {
          get().remove(entry.id)
          continue
        }
        // Network/server error: increment retry count, keep in active queue
        const updated = get().queue.map((item) =>
          item.id === entry.id ? { ...item, retryCount: item.retryCount + 1 } : item,
        )
        set({ queue: updated })
        saveQueue(updated).catch(() => {})
      }
    }
    } finally {
      set({ isReplaying: false })
    }
  },
}))
