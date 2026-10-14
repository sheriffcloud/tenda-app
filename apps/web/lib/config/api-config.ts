import { apiConfig as sharedApiConfig, type AppEnv } from '@tenda/shared'

/**
 * Web override of @tenda/shared's apiConfig. Shared reads
 * process.env.EXPO_PUBLIC_API_URL at module load — Expo inlines that prefix at
 * bundle time, but Next inlines only NEXT_PUBLIC_* and only in APP code, never
 * inside a prebuilt CJS dependency. So the base URL must be resolved HERE,
 * where the literal below is guaranteed to be inlined into both the server and
 * browser bundles; timeouts/retries still come from shared so the per-env
 * budgets cannot drift from mobile's.
 */
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
if (!baseUrl) {
  // Same loud-fallback contract as lib/env.ts: a build without the var must
  // not silently target "undefined/v1/..." — every request fails either way,
  // this makes the console say why.
  console.error(
    '[api-config] NEXT_PUBLIC_API_URL is not set — every API request will fail. ' +
      'Set it in .env.development (dev) or the deploy environment (staging/production).',
  )
}

export const apiConfig: Record<AppEnv, { baseUrl: string; timeout: number; retries: number }> = {
  development: { ...sharedApiConfig.development, baseUrl },
  staging: { ...sharedApiConfig.staging, baseUrl },
  production: { ...sharedApiConfig.production, baseUrl },
}
