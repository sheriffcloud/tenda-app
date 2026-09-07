export interface HttpRpcEndpointOptions {
  primaryUrl?: string
  fallbackUrl?: string
  defaultPrimaryUrl: string
  primaryName: string
  fallbackName: string
}

function optionalHttpUrl(name: string, value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported protocol')
    return url.toString()
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL`)
  }
}

/** Resolve, normalize and deduplicate an ordered pair of public HTTP RPC endpoints. */
export function resolveHttpRpcEndpoints(options: HttpRpcEndpointOptions): readonly string[] {
  const configuredPrimary = optionalHttpUrl(options.primaryName, options.primaryUrl)
  const fallback = optionalHttpUrl(options.fallbackName, options.fallbackUrl)
  const primary = configuredPrimary ?? optionalHttpUrl('defaultPrimaryUrl', options.defaultPrimaryUrl)
  if (primary === null) throw new Error('defaultPrimaryUrl is required')
  return fallback !== null && fallback !== primary ? [primary, fallback] : [primary]
}
