'use client'

/**
 * Browser file picker for proof uploads — the web replacement for mobile's
 * FilePicker (stage-4 plan: `<input type="file">` instead of native pickers;
 * the proof TYPE derives from the MIME, mirroring how mobile's per-source
 * pickers assign it).
 */
import { useRef } from 'react'
import { X } from 'lucide-react'
import type { FileProofType } from '@tenda/shared'
import { Button } from '@/components/ui/Button'
import type { PickedProofFile } from '@/lib/uploads/escrow-proofs'

export function proofTypeForFile(file: File): FileProofType {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'document'
}

export function FilePicker({
  files,
  onChange,
  max = 5,
}: {
  files: PickedProofFile[]
  onChange: (files: PickedProofFile[]) => void
  max?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(list: FileList | null) {
    if (list === null) return
    const picked = Array.from(list).map((file) => ({ file, type: proofTypeForFile(file) }))
    onChange([...files, ...picked].slice(0, max))
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,application/pdf"
        className="hidden"
        aria-label="Choose proof files"
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = '' // allow re-picking the same file after removal
        }}
      />
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((picked, index) => (
            <li
              key={`${picked.file.name}-${index}`}
              className="flex items-center justify-between gap-2 rounded-control border border-border-subtle px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-content-primary">{picked.file.name}</span>
              <span className="shrink-0 text-xs uppercase text-content-tertiary">{picked.type}</span>
              <button
                type="button"
                aria-label={`Remove ${picked.file.name}`}
                className="shrink-0 text-content-tertiary hover:text-content-primary"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length < max && (
        <Button variant="outline" size="md" onClick={() => inputRef.current?.click()}>
          {files.length === 0 ? 'Choose files' : 'Add another file'}
        </Button>
      )}
    </div>
  )
}
