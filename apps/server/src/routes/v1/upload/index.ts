import { FastifyPluginAsync } from 'fastify'
import { ErrorCode, isScopedUploadType } from '@tenda/shared'
import { generateUploadSignature } from '@server/lib/cloudinary'
import { authorizeScopedUpload } from '@server/lib/uploads/scoped'
import { AppError, requireBody } from '@server/lib/errors'
import type { UploadContract, UploadType, ApiError } from '@tenda/shared'

type SignatureRoute = UploadContract['signature']

const UPLOAD_TYPES: readonly UploadType[] = ['avatar', 'proof', 'chat', 'dispute']

const upload: FastifyPluginAsync = async (fastify) => {
  // POST /v1/upload/signature, return Cloudinary signed params
  fastify.post<{
    Body: SignatureRoute['body']
    Reply: SignatureRoute['response'] | ApiError
  }>(
    '/signature',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const { type, scope_id } = requireBody(request.body)

      if (!type || !UPLOAD_TYPES.includes(type)) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'type must be "avatar", "proof", "chat" or "dispute"')
      }

      // Scoped uploads (chat → conversation, dispute → escrow) are pinned to a
      // resource the caller must belong to; membership/access is checked
      // BEFORE a signature is issued, and the signed folder is sender-scoped.
      if (isScopedUploadType(type)) {
        if (typeof scope_id !== 'string' || scope_id === '') {
          throw new AppError(400, ErrorCode.VALIDATION_ERROR, `scope_id is required for ${type} uploads`)
        }
        await authorizeScopedUpload(fastify.db, type, request.user, scope_id)
        return generateUploadSignature(type, request.user.id, scope_id)
      }

      return generateUploadSignature(type, type === 'proof' ? request.user.id : undefined)
    }
  )
}

export default upload
