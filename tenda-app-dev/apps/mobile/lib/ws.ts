/**
 * Singleton WebSocket client (stage-2-listeners.md § Mobile).
 *
 * Auth rides the subprotocol header, ['tenda.v1.auth', <JWT>], matching
 * the server's parser; the JWT never appears in the URL. Reconnects with
 * exponential backoff + jitter, resubscribes every channel after a
 * reconnect, and exposes connection state so the polling hooks can act as
 * the fallback layer (poll only while disconnected).
 */

import { apiConfig, parseWsServerFrame, WS_PATH, WS_AUTH_SUBPROTOCOL, type WsServerFrame } from '@tenda/shared'
import { getJwtToken } from '@/lib/secure-store'
import { getEnv } from '@/lib/env'
import { notifyListeners } from '@tenda/shared'

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

export type WsFrame = WsServerFrame
export type WsListener = (frame: WsServerFrame) => void
export type ConnectionListener = (connected: boolean) => void

interface WsState {
  socket: WebSocket | null
  /** Guards the async token read in open() against concurrent calls. */
  opening: boolean
  connected: boolean
  attempts: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  listeners: Map<string, Set<WsListener>>
  connectionListeners: Set<ConnectionListener>
  /** True while the app wants the connection up. */
  enabled: boolean
}

const state: WsState = {
  socket: null,
  opening: false,
  connected: false,
  attempts: 0,
  reconnectTimer: null,
  listeners: new Map(),
  connectionListeners: new Set(),
  enabled: false,
}

function wsUrl(): string {
  const base = apiConfig[getEnv()].baseUrl.replace(/\/$/, '')
  return base.replace(/^http/, 'ws') + WS_PATH
}

/** send() throws on a socket past CLOSING, never let that hit callers. */
function safeSend(socket: WebSocket, payload: Record<string, unknown>): void {
  try {
    socket.send(JSON.stringify(payload))
  } catch {
    // Socket died between the connected check and the send, the onclose
    // handler reconnects and resubscribes; nothing to do here.
  }
}

function setConnected(connected: boolean): void {
  if (state.connected === connected) return
  state.connected = connected
  notifyListeners(state.connectionListeners, connected)
}

function scheduleReconnect(): void {
  if (!state.enabled || state.reconnectTimer !== null) return
  const backoff = Math.min(RECONNECT_BASE_MS * 2 ** state.attempts, RECONNECT_MAX_MS)
  const jitter = Math.random() * backoff * 0.3
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null
    void open()
  }, backoff + jitter)
  state.attempts += 1
}

async function open(): Promise<void> {
  if (!state.enabled || state.socket !== null || state.opening) return
  state.opening = true
  let token: string | null
  try {
    token = await getJwtToken()
  } catch {
    // Secure storage can be temporarily unavailable during device unlock or
    // app resume. Treat that like any other disconnected state and retry.
    scheduleReconnect()
    return
  } finally {
    state.opening = false
  }
  // disconnect() may have run while we awaited the token.
  if (!state.enabled || state.socket !== null) return
  if (!token) {
    scheduleReconnect() // not signed in yet, retry later
    return
  }

  const socket = new WebSocket(wsUrl(), [WS_AUTH_SUBPROTOCOL, token])
  state.socket = socket

  // Every handler checks identity, a stale socket's late events (e.g. the
  // onclose of one torn down by disconnect()) must not touch the state of a
  // newer socket created since.
  socket.onopen = () => {
    if (state.socket !== socket) {
      socket.close()
      return
    }
    state.attempts = 0
    setConnected(true)
    // Resubscribe everything the app cares about.
    for (const channel of state.listeners.keys()) {
      safeSend(socket, { sub: channel })
    }
  }
  socket.onmessage = (event) => {
    if (state.socket !== socket) return
    let parsed: unknown
    try {
      parsed = JSON.parse(String(event.data))
    } catch {
      return
    }
    const frame = parseWsServerFrame(parsed)
    if (frame === null) return
    const set = state.listeners.get(frame.channel)
    if (set === undefined) return
    notifyListeners(set, frame)
  }
  socket.onclose = () => {
    if (state.socket !== socket) return
    state.socket = null
    setConnected(false)
    scheduleReconnect()
  }
  socket.onerror = () => {
    // onclose follows, reconnect handled there.
    socket.close()
  }
}

export const ws = {
  /** Idempotent, call on sign-in / app foreground. */
  connect(): void {
    state.enabled = true
    void open()
  },

  /** Tear down (sign-out). Listeners are kept for the next connect. */
  disconnect(): void {
    state.enabled = false
    state.attempts = 0
    if (state.reconnectTimer !== null) {
      clearTimeout(state.reconnectTimer)
      state.reconnectTimer = null
    }
    state.socket?.close()
    state.socket = null
    setConnected(false)
  },

  isConnected(): boolean {
    return state.connected
  },

  /** Subscribe to a channel; returns the unsubscribe function. */
  subscribe(channel: string, listener: WsListener): () => void {
    let set = state.listeners.get(channel)
    const isNewChannel = set === undefined
    if (set === undefined) {
      set = new Set()
      state.listeners.set(channel, set)
    }
    set.add(listener)
    if (isNewChannel && state.connected && state.socket !== null) {
      safeSend(state.socket, { sub: channel })
    }
    return () => {
      const current = state.listeners.get(channel)
      if (current === undefined) return
      current.delete(listener)
      if (current.size === 0) {
        state.listeners.delete(channel)
        if (state.connected && state.socket !== null) {
          safeSend(state.socket, { unsub: channel })
        }
      }
    }
  },

  onConnectionChange(listener: ConnectionListener): () => void {
    state.connectionListeners.add(listener)
    return () => {
      state.connectionListeners.delete(listener)
    }
  },
}
