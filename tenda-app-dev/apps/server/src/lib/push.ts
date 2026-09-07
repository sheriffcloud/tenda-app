// Sends push notifications via the Expo Push Notification API.
// Tokens must be valid Expo push tokens (ExponentPushToken[...]).
// Silently swaps out expired tokens (DeviceNotRegistered), callers must handle DB cleanup separately.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const BATCH_SIZE = 100

interface PushMessage {
  to: string[]
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: 'default' | null
  badge?: number
  channelId?: string
}

interface ExpoPushTicket {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

interface PushLogger {
  error(obj: object, msg: string): void
  warn(obj: object, msg: string): void
}

// Returns the list of tokens Expo reported as no longer registered (DeviceNotRegistered).
// Callers should delete these from device_tokens to prevent repeated failed sends.
export async function sendPush(
  tokens: string[],
  payload: { title: string; body: string; data?: Record<string, unknown> },
  log: PushLogger,
): Promise<string[]> {
  if (tokens.length === 0) return []

  // Only send to valid Expo push tokens
  const validTokens = tokens.filter((t) => t.startsWith('ExponentPushToken['))
  if (validTokens.length === 0) return []

  const invalidTokens: string[] = []

  // Chunk into batches of BATCH_SIZE
  for (let i = 0; i < validTokens.length; i += BATCH_SIZE) {
    const batch = validTokens.slice(i, i + BATCH_SIZE)
    const message: PushMessage = {
      to: batch,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: 'default',
      channelId: 'default',
    }

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) {
        log.error({ status: res.status, body: await res.text() }, '[push] Expo API error')
        continue
      }

      const body = await res.json() as { data: ExpoPushTicket[] }
      const tickets = body.data
      // Correlate tickets back to tokens by index (Expo preserves order)
      for (let j = 0; j < tickets.length; j++) {
        const ticket = tickets[j]
        if (ticket.status === 'error') {
          log.warn({ message: ticket.message, details: ticket.details }, '[push] ticket error')
          if (ticket.details?.error === 'DeviceNotRegistered') {
            invalidTokens.push(batch[j])
          }
        }
      }
    } catch (err) {
      log.error({ err }, '[push] Failed to send batch')
    }
  }

  return invalidTokens
}
