/**
 * The scalar shapes every component file and the path parameters share —
 * spelled once, so "a uuid", "an instant" or "a base-unit amount" cannot be
 * documented two ways.
 */
import { AMOUNT_RAW_PATTERN, CHAIN_MANIFEST, LOCATIONS } from '@tenda/shared'
import type { SchemaObject } from './schema-types'

export const uuid: SchemaObject = { type: 'string', format: 'uuid' }
export const latitude: SchemaObject = { type: 'number', minimum: -90, maximum: 90 }
export const longitude: SchemaObject = { type: 'number', minimum: -180, maximum: 180 }
export const isoInstant: SchemaObject = { type: 'string', format: 'date-time', description: 'ISO-8601 UTC' }
/** Base-unit integer as a canonical decimal STRING — never a JSON number (2^53 is too small). */
export const rawAmount: SchemaObject = { type: 'string', pattern: AMOUNT_RAW_PATTERN.source, description: 'Base units, decimal string' }
/** The chains this codebase knows, from the manifest — a closed, append-only vocabulary. */
export const chainId: SchemaObject = { type: 'string', enum: CHAIN_MANIFEST.map((entry) => entry.id), description: 'CAIP-2 chain id' }
/** ISO-3166 alpha-2 codes of the markets the product serves. */
export const COUNTRY_CODES = Object.keys(LOCATIONS)
