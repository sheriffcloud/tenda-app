import { apiRoutes } from '../routes'
import type {
  User,
  AuthNonceResponse,
  ChallengeBody,
  ChallengeResponse,
  VerifyBody,
  VerifyResponse,
  LoginMethodsResponse,
  LinkWalletBody,
  LinkWalletResponse,
  WalletRefBody,
  UnlinkWalletResponse,
  SetPrimaryWalletResponse,
} from '../..'
import type { ApiRequest } from './types'

const { auth } = apiRoutes

export function createAuthApi(request: ApiRequest) {
  return {
    nonce: () => request<AuthNonceResponse>('POST', auth.nonce),
    /**
     * Stage 9 unified, issue an OTP (phone/email). Wallet/OAuth challenge
     * off-device. The bearer is the server's link/sign-in discriminator, so it
     * is sent ONLY with `link: true`; sign-in stays anonymous even when a
     * (possibly stale) JWT is stored.
     */
    challenge: (body: ChallengeBody, opts?: { link?: boolean }) =>
      request<ChallengeResponse>('POST', auth.challenge, { body, auth: opts?.link === true }),
    /**
     * Stage 9 unified, verify a proof → { token, user, is_new }. Anonymous by
     * default (LOGS IN / creates); pass `link: true` to attach the bearer and
     * LINK the identity to the current account instead. Never auto-attaches
     * the stored JWT: a dead token on the sign-in path would 401 every retry.
     */
    verify: (body: VerifyBody, opts?: { link?: boolean }) =>
      request<VerifyResponse>('POST', auth.verify, { body, auth: opts?.link === true }),
    me: () => request<User>('GET', auth.me),
    /** Stage 9, the caller's non-wallet sign-in identities (Sign-in & security). */
    methods: () => request<LoginMethodsResponse>('GET', auth.methods),
    linkWallet: (body: LinkWalletBody) =>
      request<LinkWalletResponse>('POST', auth.linkWallet, { body }),
    unlinkWallet: (body: WalletRefBody) =>
      request<UnlinkWalletResponse>('POST', auth.unlinkWallet, { body }),
    setPrimaryWallet: (body: WalletRefBody) =>
      request<SetPrimaryWalletResponse>('POST', auth.setPrimaryWallet, { body }),
  }
}
