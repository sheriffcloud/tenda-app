/**
 * The proof contract's component schemas (v0): what a gig demands
 * (`ProofParams`) and what a worker handed over (`EscrowProof`, with the
 * data-proof payloads by type). Split from ./schemas along the one seam the
 * document has — the rest of that file is listings.
 */
import {
  MAX_GEOTAG_RADIUS_M,
  MIN_GEOTAG_RADIUS_M,
  PROOF_TYPES,
  STRUCTURED_FIELD_KINDS,
  type EscrowProof,
  type GeotagProofParams,
  type GeotagProofPayload,
  type ProofParams,
  type StructuredProofField,
  type StructuredProofParams,
  type StructuredProofPayload,
  type TextProofPayload,
} from '@tenda/shared'
import { closedFor, nullable, type SchemaObject } from './schema-types'
import { isoInstant, uuid } from './scalars'

const structuredField = closedFor<StructuredProofField>(
  {
    name: { type: 'string', minLength: 1 },
    kind: { type: 'string', enum: STRUCTURED_FIELD_KINDS },
    required: { type: 'boolean' },
  },
  ['name', 'kind', 'required'],
)

export const proofParams = closedFor<ProofParams>(
  {
    geotag: closedFor<GeotagProofParams>(
      { radius_m: { type: 'integer', minimum: MIN_GEOTAG_RADIUS_M, maximum: MAX_GEOTAG_RADIUS_M } },
      ['radius_m'],
      'A geotag check-in is verified within this many metres of the gig pin.',
    ),
    structured: closedFor<StructuredProofParams>({ fields: { type: 'array', items: structuredField } }, ['fields']),
  },
  [],
  'Per-type params behind the proof requirements; keys present only for required types.',
)

const proofPayload: SchemaObject = {
  description: 'A data proof\'s substance, by type: geotag, text or structured.',
  oneOf: [
    closedFor<GeotagProofPayload>({ latitude: { type: 'number' }, longitude: { type: 'number' } }, ['latitude', 'longitude']),
    closedFor<TextProofPayload>({ text: { type: 'string' } }, ['text']),
    closedFor<StructuredProofPayload>(
      {
        values: {
          type: 'object',
          // A union spelled as oneOf: strict validators refuse a multi-type
          // `type` list unless it is `X | null`.
          additionalProperties: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
        },
      },
      ['values'],
    ),
  ],
}

export const escrowProof = closedFor<EscrowProof>(
  {
    id: uuid,
    escrow_id: uuid,
    type: { type: 'string', enum: PROOF_TYPES },
    url: nullable({ type: 'string', description: 'File proofs only' }),
    payload: nullable(proofPayload),
    uploaded_at: isoInstant,
  },
  ['id', 'escrow_id', 'type', 'url', 'payload', 'uploaded_at'],
)
