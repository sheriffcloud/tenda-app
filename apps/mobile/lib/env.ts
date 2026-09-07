import Constants from 'expo-constants'
import type { AppEnv } from '@tenda/shared'

export function getEnv(): AppEnv {
  const env = Constants.expoConfig?.extra?.APP_ENV
  if (env === 'staging' || env === 'production') return env
  // In a production binary (non-dev), APP_ENV should always be set explicitly via
  // the EAS build profile. If it falls back to 'development' here, all API requests
  // will target the dev server, flag it loudly so it shows up in crash reports.
  if (!__DEV__) {
    console.error(
      '[env] APP_ENV is not set in this build, falling back to "development". ' +
      'Ensure the EAS build profile sets APP_ENV=staging or APP_ENV=production.'
    )
  }
  return 'development'
}
