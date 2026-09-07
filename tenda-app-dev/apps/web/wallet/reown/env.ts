/**
 * Public Reown configuration, validated BEFORE any wallet runtime is
 * imported (ported from apps/admin/providers/reown/env.ts). An invented
 * fallback origin would silently register the wrong application identity
 * with wallets, so a partially-set configuration throws instead of guessing.
 */
export type ReownEnvironment =
  | { enabled: false }
  | { enabled: true; projectId: string; webUrl: string }

export function parseReownEnvironment(
  projectId: string | undefined,
  webUrl: string | undefined,
): ReownEnvironment {
  const normalizedProjectId = projectId?.trim()
  if (!normalizedProjectId) return { enabled: false }

  const normalizedWebUrl = webUrl?.trim()
  if (!normalizedWebUrl) {
    throw new Error('NEXT_PUBLIC_WEB_URL is required when NEXT_PUBLIC_REOWN_PROJECT_ID is set')
  }

  let url: URL
  try {
    url = new URL(normalizedWebUrl)
  } catch {
    throw new Error('NEXT_PUBLIC_WEB_URL must be an absolute http(s) URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_WEB_URL must be an absolute http(s) URL')
  }

  // Origins are stable across server and client; paths/query/fragment are not
  // application identity and would invite environment-specific drift.
  return { enabled: true, projectId: normalizedProjectId, webUrl: url.origin }
}

/**
 * Read from the inlined build env. Must stay in app code — Next.js only
 * inlines NEXT_PUBLIC_* inside the app's own compilation (lib/api-config.ts
 * learned this the hard way with CJS deps).
 */
export function reownEnvironment(): ReownEnvironment {
  return parseReownEnvironment(
    process.env.NEXT_PUBLIC_REOWN_PROJECT_ID,
    process.env.NEXT_PUBLIC_WEB_URL,
  )
}
