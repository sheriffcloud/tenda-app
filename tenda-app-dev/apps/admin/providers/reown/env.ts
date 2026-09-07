export type ReownEnvironment =
  | { enabled: false }
  | { enabled: true; projectId: string; adminUrl: string }

/**
 * Validate the public values before importing any wallet runtime. An invented
 * fallback origin would make server and browser metadata disagree and would
 * silently register the wrong application with wallets.
 */
export function parseReownEnvironment(
  projectId: string | undefined,
  adminUrl: string | undefined,
): ReownEnvironment {
  const normalizedProjectId = projectId?.trim()
  if (!normalizedProjectId) return { enabled: false }

  const normalizedAdminUrl = adminUrl?.trim()
  if (!normalizedAdminUrl) {
    throw new Error('NEXT_PUBLIC_ADMIN_URL is required when NEXT_PUBLIC_REOWN_PROJECT_ID is set')
  }

  let url: URL
  try {
    url = new URL(normalizedAdminUrl)
  } catch {
    throw new Error('NEXT_PUBLIC_ADMIN_URL must be an absolute http(s) URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_ADMIN_URL must be an absolute http(s) URL')
  }

  // Origins are stable across server and client; paths/query/fragment are not
  // application identity and would invite environment-specific drift.
  return { enabled: true, projectId: normalizedProjectId, adminUrl: url.origin }
}

export function reownEnvironment(): ReownEnvironment {
  return parseReownEnvironment(
    process.env.NEXT_PUBLIC_REOWN_PROJECT_ID,
    process.env.NEXT_PUBLIC_ADMIN_URL,
  )
}
