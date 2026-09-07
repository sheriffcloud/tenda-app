export const apiConfig = {
  development: {
    baseUrl: process.env.EXPO_PUBLIC_API_URL!,
    timeout: 5000,
    retries: 0,
  },
  staging: {
    baseUrl: process.env.EXPO_PUBLIC_API_URL!,
    timeout: 10000,
    retries: 2,
  },
  production: {
    baseUrl: process.env.EXPO_PUBLIC_API_URL!,
    timeout: 15000,
    retries: 3,
  },
} as const

export type AppEnv = keyof typeof apiConfig
export type ApiConfig = (typeof apiConfig)[AppEnv]
