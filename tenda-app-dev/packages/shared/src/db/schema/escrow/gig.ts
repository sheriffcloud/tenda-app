/** Gig satellite: the human-facing listing fields + full-text search vector. */

import { sql, type SQL } from 'drizzle-orm'
import { boolean, customType, doublePrecision, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import type { ProofParams } from '../../../constants/proof-params'
import { escrows } from './escrows'
import { proofTypeEnum } from './enums'

// S5.3 (closes open #25): Postgres tsvector for gig full-text search.
// drizzle has no built-in tsvector — minimal customType; the column is
// GENERATED ALWAYS so writers never touch it.
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector'
  },
})

export const gig_details = pgTable(
  'gig_details',
  {
    escrow_id: uuid('escrow_id')
      .primaryKey()
      .references(() => escrows.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    category: text('category').notNull(),
    country: text('country'),
    city: text('city'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    remote: boolean('remote').notNull().default(false),
    cross_border: boolean('cross_border').notNull().default(false),
    /**
     * Proof types the worker MUST attach before `submit` is built. Empty =
     * no requirement, which is the pre-existing behaviour every gig created
     * before this column keeps. Deduplicated and stored in PROOF_TYPES order
     * by the route, so equivalent requests compare equal.
     */
    proof_requirements: proofTypeEnum('proof_requirements')
      .array()
      .notNull()
      .default(sql`ARRAY[]::proof_type[]`),
    /**
     * Per-type params for the requirements above (geotag radius, structured
     * fields) — mandatory for those types, refused for others; see
     * `parseProofParams`. Null = no param-bearing type is required, which is
     * every pre-existing row.
     */
    proof_params: jsonb('proof_params').$type<ProofParams>(),
    // Weighted: title (A) outranks description (B) in ts_rank ordering.
    search_vector: tsvector('search_vector').generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(${gig_details.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${gig_details.description}, '')), 'B')`,
    ),
  },
  (t) => [
    index('gig_details_category_idx').on(t.category),
    index('gig_details_country_idx').on(t.country),
    index('gig_details_search_idx').using('gin', t.search_vector),
  ],
)
