/**
 * /v1/bank-accounts (stage-8): GET list, POST create. Country + rail rules
 * come from the shared payout-spec registry (getPayoutSpec / getPayoutRail) —
 * the SAME source the mobile payout screen renders, so client fields and this
 * validation can never diverge. NIP name-enquiry (Nigeria bank only, when
 * configured; rate-limited 5/min/user as the API is paid per call).
 */

import type { FastifyPluginAsync } from 'fastify'
import { ErrorCode, getPayoutSpec, getPayoutRail, isPayoutRailKind, PAYOUT_RAIL_KINDS } from '@tenda/shared'
import type { PayoutRailKind, BankAccountSummary } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { drizzleBankAccountStore } from '@server/features/fiat-rails'
import type { BankAccountRow } from '@server/features/fiat-rails'
import { buildNameEnquiry } from '@server/lib/nip'
import { isPostgresUniqueViolation } from '@server/lib/db'
import { requireFiatRails, requireStr } from '@server/lib/fiat-routes'

function serialize(a: BankAccountRow): BankAccountSummary {
  // Mask via the rail's own rule (banks show 4, MoMo shows 3); fall back to a
  // 4-tail mask if the country/rail is somehow unknown.
  const rail = getPayoutRail(a.country, a.kind)
  const account_number_masked = rail?.maskAccountNumber(a.account_number) ?? `•••• ${a.account_number.slice(-4)}`
  return {
    id: a.id,
    country: a.country,
    kind: a.kind,
    bank_code: a.bank_code,
    account_number_masked,
    account_name: a.account_name,
    is_default: a.is_default,
    verified: a.verified_at !== null,
    created_at: a.created_at.toISOString(),
  }
}

interface CreateBody {
  country?: unknown
  kind?: unknown
  bank_code?: unknown
  account_number?: unknown
  account_name?: unknown
  is_default?: unknown
}

function parseKind(raw: unknown): PayoutRailKind {
  if (raw === undefined) return 'bank'
  if (!isPayoutRailKind(raw)) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, `kind must be one of: ${PAYOUT_RAIL_KINDS.join(', ')}`)
  }
  return raw
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: [fastify.authenticate, requireFiatRails] }, async (request) => {
    const rows = await drizzleBankAccountStore(fastify.db).list(request.user.id)
    return rows.map(serialize)
  })

  fastify.post<{ Body: CreateBody }>(
    '/',
    {
      preHandler: [fastify.authenticate, requireFiatRails],
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const b = request.body ?? {}
      const country = requireStr('country', b.country, 2).toUpperCase()
      const kind = parseKind(b.kind)

      // Country + rail must be a supported payout market (single source).
      if (getPayoutSpec(country) === null) {
        throw new AppError(422, ErrorCode.BANK_ACCOUNT_INVALID, `payouts are not supported in '${country}'`)
      }
      const rail = getPayoutRail(country, kind)
      if (rail === null) {
        throw new AppError(422, ErrorCode.BANK_ACCOUNT_INVALID, `${kind} payouts are not available in '${country}'`)
      }

      const bank_code = requireStr('bank_code', b.bank_code, 30)
      const account_number = requireStr('account_number', b.account_number, 30)

      // Name from NIP name-enquiry (Nigeria bank only, when configured);
      // user-supplied and unverified otherwise.
      const enquiry = country === 'NG' && kind === 'bank' ? buildNameEnquiry() : null
      let account_name: string
      let verified_at: Date | null = null
      if (enquiry !== null) {
        const resolved = await enquiry.lookup(bank_code, account_number)
        if (resolved === null) {
          throw new AppError(422, ErrorCode.BANK_ACCOUNT_INVALID, 'account did not resolve, check the number')
        }
        account_name = resolved
        verified_at = new Date()
      } else {
        account_name = requireStr('account_name', b.account_name, 200)
      }

      // Authoritative field validation via the rail spec.
      const invalid = rail.validate({ bank_code, account_number, account_name })
      if (invalid !== null) {
        throw new AppError(422, ErrorCode.BANK_ACCOUNT_INVALID, invalid)
      }

      try {
        const row = await drizzleBankAccountStore(fastify.db).insert({
          user_id: request.user.id,
          country,
          kind,
          bank_code,
          account_number,
          account_name,
          is_default: b.is_default === true,
          verified_at,
        })
        return reply.code(201).send(serialize(row))
      } catch (err) {
        if (isPostgresUniqueViolation(err)) {
          throw new AppError(409, ErrorCode.VALIDATION_ERROR, 'this bank account is already saved')
        }
        throw err
      }
    },
  )
}

export default route
