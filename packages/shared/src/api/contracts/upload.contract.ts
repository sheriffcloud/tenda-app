import type { Endpoint } from '../endpoint'
import type { UploadType, CloudinarySignature } from '../../types'

/**
 * Body of POST /v1/upload/signature. `scope_id` is required for scoped
 * upload types (chat → conversation id, dispute → escrow id) and ignored
 * for unscoped ones (avatar, proof).
 */
export interface UploadSignatureBody {
  type: UploadType
  scope_id?: string
}

export interface UploadContract {
  signature: Endpoint<'POST', undefined, UploadSignatureBody, undefined, CloudinarySignature>
}
