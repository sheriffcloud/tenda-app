type QueryValue = null | string | number | boolean | QueryValue[] | { [key: string]: QueryValue }

function normalizeQueryValue(value: unknown): QueryValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (Array.isArray(value)) return value.map(normalizeQueryValue)
  if (typeof value !== 'object') return String(value)
  const normalized: { [key: string]: QueryValue } = {}
  for (const key of Object.keys(value).sort()) {
    const entry = (value as Record<string, unknown>)[key]
    if (entry !== undefined) normalized[key] = normalizeQueryValue(entry)
  }
  return normalized
}

/** Stable identity for equivalent query objects regardless of property insertion order. */
export function createQueryKey(query: object): string {
  return JSON.stringify(normalizeQueryValue(query))
}
