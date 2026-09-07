/** Proof satellite: what a worker attached to satisfy the gig's requirements. */

import { sql } from 'drizzle-orm'
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { ProofPayload } from '../../../constants/proof-payloads'
import { escrows } from './escrows'
import { proofTypeEnum } from './enums'

export const escrow_proofs = pgTable(
  'escrow_proofs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    escrow_id: uuid('escrow_id')
      .notNull()
      .references(() => escrows.id, { onDelete: 'cascade' }),
    /**
     * The proof's substance, exactly one per class (app-enforced in
     * validateEscrowProofUploads): FILE types carry `url` (Cloudinary),
     * DATA types carry `payload` (see ProofPayload). The other column is null.
     */
    url: text('url'),
    payload: jsonb('payload').$type<ProofPayload>(),
    type: proofTypeEnum('type').notNull(),
    uploaded_at: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('escrow_proofs_escrow_idx').on(t.escrow_id),
    /**
     * One row per distinct piece of evidence, both classes. Coalesced because
     * a UNIQUE btree treats NULLs as distinct — with a nullable url, two
     * identical data proofs (url NULL) would never conflict, and vice versa.
     * The sentinels cannot collide with real values: a real url is never ''
     * and a real payload is never jsonb null (parseProofPayload requires an
     * object).
     */
    uniqueIndex('escrow_proofs_identity_uq').on(
      t.escrow_id,
      t.type,
      sql`coalesce(${t.url}, '')`,
      sql`coalesce(${t.payload}, 'null'::jsonb)`,
    ),
  ],
)
