import type { GigSummary } from '../../types/gig'
import { GIG_CATEGORIES } from '../../constants/categories'
import { PROOF_TYPES } from '../../constants/proofs'
import { isAmountRaw } from '../../utils/amount-raw'
import type { WsServerFrame } from './ws.contract'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasString(value: JsonRecord, key: string): boolean {
  return typeof value[key] === 'string'
}

function hasNullableString(value: JsonRecord, key: string): boolean {
  return value[key] === null || typeof value[key] === 'string'
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}

function hasNullableIsoTimestamp(value: JsonRecord, key: string): boolean {
  return value[key] === null || isIsoTimestamp(value[key])
}

function isStringRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')
}

function hasMessageFields(message: JsonRecord): boolean {
  const attachmentType = message.attachment_type
  const hasAttachment =
    typeof message.attachment_url === 'string' &&
    (attachmentType === 'image' || attachmentType === 'file') &&
    typeof message.attachment_size === 'number' &&
    Number.isFinite(message.attachment_size) &&
    message.attachment_size >= 0
  const hasNoAttachment =
    message.attachment_url === null && attachmentType === null && message.attachment_size === null
  return hasString(message, 'id') &&
    hasString(message, 'conversation_id') &&
    hasString(message, 'sender_id') &&
    hasString(message, 'content') &&
    hasNullableString(message, 'escrow_id') &&
    hasNullableString(message, 'escrow_title') &&
    (message.escrow_kind === null || message.escrow_kind === 'gig' || message.escrow_kind === 'exchange') &&
    hasNullableIsoTimestamp(message, 'read_at') &&
    hasNullableIsoTimestamp(message, 'created_at') &&
    (hasAttachment || hasNoAttachment)
}

function hasChannelPrefix(frame: JsonRecord, prefix: string): boolean {
  return typeof frame.channel === 'string' && frame.channel.startsWith(prefix) && frame.channel.length > prefix.length
}

function isCanonicalRevision(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)
}

function isGigSummary(value: unknown): value is GigSummary {
  if (!isRecord(value)) return false
  const creator = value.creator
  return (
    hasString(value, 'escrow_id') && value.escrow_id !== '' &&
    isCanonicalRevision(value.public_feed_revision) &&
    hasString(value, 'chain_id') && value.chain_id !== '' &&
    hasString(value, 'asset') && value.asset !== '' &&
    isAmountRaw(value.amount_raw) &&
    value.status === 'open' &&
    (value.accept_deadline === null || isIsoTimestamp(value.accept_deadline)) &&
    (value.created_at === null || isIsoTimestamp(value.created_at)) &&
    hasString(value, 'title') &&
    hasNullableString(value, 'description') &&
    typeof value.category === 'string' && (GIG_CATEGORIES as readonly string[]).includes(value.category) &&
    hasNullableString(value, 'country') &&
    hasNullableString(value, 'city') &&
    (value.latitude === null || typeof value.latitude === 'number' && Number.isFinite(value.latitude)) &&
    (value.longitude === null || typeof value.longitude === 'number' && Number.isFinite(value.longitude)) &&
    typeof value.remote === 'boolean' &&
    typeof value.cross_border === 'boolean' &&
    typeof value.requires_approval === 'boolean' &&
    Array.isArray(value.proof_requirements) && value.proof_requirements.every(
      (proof) => typeof proof === 'string' && (PROOF_TYPES as readonly string[]).includes(proof),
    ) &&
    // Structural only, like `creator` below: the server built the frame from
    // params it validated at create; the guard's job is shape, not re-audit.
    (value.proof_params === null || isRecord(value.proof_params)) &&
    isRecord(creator) &&
    hasString(creator, 'id') && creator.id !== '' &&
    hasString(creator, 'first_name') &&
    hasString(creator, 'last_name') &&
    hasNullableString(creator, 'avatar_url') &&
    hasNullableString(creator, 'review_score') &&
    typeof creator.is_seeker === 'boolean' &&
    // Every UserRef key, is_agent included (#19): a frame that omits it would
    // insert a card whose poster reads as a person.
    typeof creator.is_agent === 'boolean' &&
    hasNullableString(creator, 'country')
  )
}

function hasFeedBase(frame: JsonRecord): boolean {
  return (
    frame.channel === 'feed:gigs' &&
    typeof frame.event_id === 'string' && frame.event_id !== '' &&
    typeof frame.escrow_id === 'string' && frame.escrow_id !== '' &&
    isCanonicalRevision(frame.gig_revision) &&
    isIsoTimestamp(frame.occurred_at)
  )
}

/** Validate untrusted WebSocket/Redis JSON before it enters application code. */
export function parseWsServerFrame(input: unknown): WsServerFrame | null {
  if (!isRecord(input) || !hasString(input, 'channel') || !hasString(input, 'type')) return null
  if (input.type === 'message') {
    const message = input.message
    if (!isRecord(message)) return null
    const channelMatches =
      input.channel === `chat:${String(message.conversation_id)}` || hasChannelPrefix(input, 'user:')
    return channelMatches && hasMessageFields(message)
      ? input as unknown as WsServerFrame
      : null
  }
  if (input.type === 'escrow_event') {
    return hasString(input, 'escrow_id') &&
      input.channel === `escrow:${String(input.escrow_id)}` &&
      hasString(input, 'event') &&
      hasString(input, 'tx_ref')
      ? input as unknown as WsServerFrame
      : null
  }
  if (input.type === 'notification') {
    const notification = input.notification
    return hasChannelPrefix(input, 'user:') && isRecord(notification) &&
      hasString(notification, 'id') &&
      hasString(notification, 'title') &&
      hasString(notification, 'body') &&
      (notification.data === null || isStringRecord(notification.data)) &&
      hasNullableIsoTimestamp(notification, 'read_at') &&
      hasNullableIsoTimestamp(notification, 'created_at')
      ? input as unknown as WsServerFrame
      : null
  }
  if (input.type === 'gig_available') {
    return hasFeedBase(input) &&
      isGigSummary(input.gig) &&
      input.gig.escrow_id === input.escrow_id &&
      input.gig.public_feed_revision === input.gig_revision
      ? input as unknown as WsServerFrame
      : null
  }
  if (input.type === 'gig_unavailable') {
    const causes = ['accepted', 'assigned', 'cancelled', 'expired', 'hidden', 'not_public']
    return hasFeedBase(input) && typeof input.cause === 'string' && causes.includes(input.cause)
      ? input as unknown as WsServerFrame
      : null
  }
  return null
}
