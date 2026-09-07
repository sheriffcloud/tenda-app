import { parseWsServerFrame, type WsServerFrame } from '@tenda/shared'

export const REALTIME_ENVELOPE_SCHEMA_VERSION = 1 as const
export const REALTIME_MAX_MESSAGE_BYTES = 64 * 1_024

export interface RealtimeEnvelope {
  schema_version: typeof REALTIME_ENVELOPE_SCHEMA_VERSION
  event_id: string
  source_instance: string
  frame: WsServerFrame
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseRealtimeEnvelope(value: unknown): RealtimeEnvelope | null {
  if (!isRecord(value)) return null
  if (value.schema_version !== REALTIME_ENVELOPE_SCHEMA_VERSION) return null
  if (typeof value.event_id !== 'string' || value.event_id === '') return null
  if (typeof value.source_instance !== 'string' || value.source_instance === '') return null
  const frame = parseWsServerFrame(value.frame)
  if (frame !== null && 'event_id' in frame && frame.event_id !== value.event_id) return null
  return frame === null
    ? null
    : {
        schema_version: REALTIME_ENVELOPE_SCHEMA_VERSION,
        event_id: value.event_id,
        source_instance: value.source_instance,
        frame,
      }
}

/** Serialize only envelopes every replica can accept; measured as UTF-8 bytes. */
export function serializeRealtimeEnvelope(envelope: RealtimeEnvelope): string | null {
  const serialized = JSON.stringify(envelope)
  return Buffer.byteLength(serialized, 'utf8') <= REALTIME_MAX_MESSAGE_BYTES
    ? serialized
    : null
}
