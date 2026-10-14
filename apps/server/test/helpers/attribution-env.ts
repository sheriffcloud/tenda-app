/**
 * Run a body with an attribution code set, and put `process.env` back.
 *
 * The attribution feature reads `process.env` by default and the adapter takes
 * no env parameter — threading one through it for a single feature is exactly
 * the coupling `features/attribution` exists to avoid — so a test that wants a
 * code configured has to set the real thing and restore it.
 *
 * SHARED because it was written twice: once as a local helper in the adapter
 * suite and once inlined four times in the relay suite. The restore is the part
 * that must not drift — miss it in one branch and every later test in that FILE
 * runs with a code set, which is a false green nobody would look for.
 */
export async function withAttributionCode<T>(
  code: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const key = 'CELO_ATTRIBUTION_CODE'
  const previous = process.env[key]
  if (code === undefined) delete process.env[key]
  else process.env[key] = code
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  }
}
