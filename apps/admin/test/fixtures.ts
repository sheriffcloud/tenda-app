/**
 * COMPLETE wire rows for the dashboard's tests.
 *
 * The suites used to build rows as `{ id: 'r1', reason: 'spam' } as Report`: a cast
 * over a partial object, which says nothing about the shape and keeps compiling
 * when the contract moves. These are whole rows in the form the server sends (dates
 * as ISO strings, via AdminContract), so a column added to a table, or a field the
 * server stops sending, is a compile error here instead of a green test over a row
 * that no longer exists.
 */
import type {
  AdminFiatIntentRow,
  AdminFiatProviderRow,
  AdminUserDetail,
  ModerationVerdictRow,
} from '@tenda/shared'
import type { AnnouncementRow, ReportRow } from '@/api/client'

const AT = '2026-06-10T00:00:00.000Z'

export function reportRow(over: Partial<ReportRow> = {}): ReportRow {
  return {
    id: 'r1', reporter_id: 'u-reporter', reported_user_id: 'u-reported', content_type: 'user',
    content_id: 'c1', reason: 'spam', note: 'buying followers', content_snapshot: null,
    status: 'pending', admin_note: null, reviewed_at: null, created_at: AT,
    ...over,
  }
}

export function announcementRow(over: Partial<AnnouncementRow> = {}): AnnouncementRow {
  return {
    id: 'a1', title: 'Heads up', body: 'Maintenance', priority: 1, target: null, target_value: null,
    is_active: true, published_at: AT, expires_at: null, created_by: null, created_at: AT, updated_at: AT,
    ...over,
  }
}

export function verdictRow(over: Partial<ModerationVerdictRow> = {}): ModerationVerdictRow {
  return {
    id: 'm1', subject_kind: 'gig_published', subject_id: 'g1', input_hash: 'h', decision: 'block', reasons: ['spam'],
    provider: 'claude', model: 'gpt', cost_usd: '0.01', latency_ms: 120, created_at: AT,
    ...over,
  }
}

export function intentRow(over: Partial<AdminFiatIntentRow> = {}): AdminFiatIntentRow {
  return {
    id: 'i1', direction: 'onramp', user_id: 'u1', wallet_address: '0xabc', chain_id: 'eip155:42220',
    provider: 'yc', fiat_currency: 'NGN', fiat_amount: '50000', asset: 'USDC_CELO', asset_amount_raw: '30000000',
    rate: '1650', fee_amount: '0', status: 'awaiting_provider', provider_ref: null, kyc_required: false,
    kyc_url: null, expires_at: AT, metadata: null, created_at: AT, updated_at: AT,
    ...over,
  }
}

export function providerRow(over: Partial<AdminFiatProviderRow> = {}): AdminFiatProviderRow {
  return { id: 'yc', display_name: 'Yellow Card', capabilities: {}, priority: 1, is_enabled: true, config: null, ...over }
}

export function userDetail(over: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: 'u1', first_name: 'Ada', last_name: 'Lovelace', bio: null, avatar_url: null, country: 'NG', city: 'Lagos',
    latitude: null, longitude: null, role: 'user', status: 'active', is_seeker: false, is_agent: false,
    review_score: null, sponsored_tx_remaining: 3, advanced_mode_enabled: false, announcements_read_at: null,
    last_active_at: null, created_at: AT, updated_at: AT,
    dispute_metric: { closed_engagements: 0, disputed: 0, dispute_rate_bps: null, fraud_flag: false },
    ...over,
  }
}
