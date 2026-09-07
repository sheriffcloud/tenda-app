/**
 * Wallet error taxonomy — platform-neutral, shared by the mobile and web
 * wallet adapters (moved from apps/mobile/wallet/errors.ts, 2026-08-15).
 * A standalone module so pure consumers (auth composers, adapters, tests)
 * import the type without pulling any transport code.
 */
export type WalletErrorCode =
  | 'no_wallet'
  | 'declined'
  | 'network'
  | 'insufficient_balance'
  /** The wallet never answered a session request (lost relay response). */
  | 'timeout'
  | 'unknown'

export class WalletError extends Error {
  constructor(
    public readonly code: WalletErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'WalletError'
  }
}
