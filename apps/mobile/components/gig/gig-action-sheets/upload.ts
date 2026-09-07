import { showToast } from '@/components/ui/Toast'
import { uploadToCloudinary } from '@/lib/upload'
import type { PickedFile } from '@/components/form/FilePicker'
import type { ProofType } from '@tenda/shared'

export type Proof = { url: string; type: ProofType }

/**
 * Upload picked proof files to Cloudinary in order. Returns the proof list on
 * success, or null if any file fails, the failing file is toasted and the
 * already-uploaded ones are discarded (the user retries with the full set).
 */
export async function uploadProofs(files: PickedFile[]): Promise<Proof[] | null> {
  const proofs: Proof[] = []
  for (const file of files) {
    try {
      const url = await uploadToCloudinary(file, 'proof')
      proofs.push({ url, type: file.type })
    } catch (e) {
      showToast('error', `Failed to upload "${file.name}": ${(e as Error).message}`)
      return null
    }
  }
  return proofs
}
