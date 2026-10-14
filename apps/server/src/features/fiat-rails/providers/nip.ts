/**
 * NIP name-enquiry seam (stage-8 § bank accounts). The live HTTP
 * implementation lands with the #61 NIP API credentials, vendor-specific
 * paths/fields finalize there. Until then accounts save unverified
 * (verified_at null) with the user-supplied name; the offramp provider
 * re-validates the account on its own side regardless.
 */

export interface NameEnquiry {
  /** Resolved account name, or null when the account doesn't resolve. */
  lookup(bank_code: string, account_number: string): Promise<string | null>
}

/**
 * Null until the #61 vendor integration lands, setting NIP_API_KEY alone
 * must not break bank-account creation with a stub that throws. The env
 * var is reserved so deploys can stage the secret ahead of the code.
 */
export function buildNameEnquiry(): NameEnquiry | null {
  // #61 wires the vendor HTTP impl behind getConfig().NIP_API_KEY; until
  // then accounts always save unverified, regardless of the env.
  return null
}
