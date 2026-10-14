/**
 * Copy to the clipboard with feedback through the toast layer — the one rule
 * every copy affordance follows (CopyButton, the gig share fallback), so a
 * denied clipboard reads the same everywhere: a failure, never a silent
 * success. The toasts ARE the answer; nothing is returned for a caller to
 * branch on, because no caller has a next step that differs.
 */
import { showToast } from './Toast'

export const CLIPBOARD_COPY = {
  copied: (label: string) => `${label} copied`,
  failed: 'Could not copy — select the text instead',
} as const

export async function copyText(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    showToast('success', CLIPBOARD_COPY.copied(label))
  } catch {
    // Clipboard access can be denied (permissions policy, insecure context).
    showToast('error', CLIPBOARD_COPY.failed)
  }
}
