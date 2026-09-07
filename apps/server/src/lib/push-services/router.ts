/**
 * Per-platform push router (S5.1): split tokens by platform and dispatch to
 * each configured service. Unconfigured platforms degrade loudly (logged +
 * counted failed), never silently dropped, and never pruned as dead tokens.
 */

import type { PushService } from '@server/chains/types'
import type { DevicePlatform, PlatformToken, PushLogger, PushPayload } from './shared'

export interface PushRouterDeps {
  /** Missing platform = provider unconfigured → tokens counted failed. */
  services: Partial<Record<DevicePlatform, PushService>>
  log: PushLogger
}

export async function routePush(
  deps: PushRouterDeps,
  tokens: ReadonlyArray<PlatformToken>,
  payload: PushPayload,
): Promise<{ ok: number; failed: number; invalid_tokens: string[] }> {
  const grouped = new Map<DevicePlatform, string[]>()
  for (const t of tokens) {
    const list = grouped.get(t.platform) ?? []
    list.push(t.token)
    grouped.set(t.platform, list)
  }

  let ok = 0
  let failed = 0
  const invalid_tokens: string[] = []
  for (const [platform, list] of grouped) {
    const service = deps.services[platform]
    if (service === undefined) {
      // Unconfigured provider ≠ dead tokens, counted failed, never pruned.
      failed += list.length
      deps.log.warn({ platform, count: list.length }, 'push: provider not configured')
      continue
    }
    const result = await service.send({
      tokens: list,
      title: payload.title,
      body: payload.body,
      ...(payload.data !== undefined ? { data: payload.data } : {}),
    })
    ok += result.ok
    failed += result.failed
    invalid_tokens.push(...result.invalid_tokens)
  }
  return { ok, failed, invalid_tokens }
}
