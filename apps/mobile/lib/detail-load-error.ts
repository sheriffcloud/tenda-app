/**
 * Why a detail screen's load failed, and whether what it was showing is still
 * worth keeping on screen.
 *
 * The distinction is the whole point. A detail store that blanks itself on ANY
 * failure tears a good screen off on one flaky request; one that never blanks —
 * which is what both gig and exchange did — keeps rendering a listing the
 * server has stopped serving, with every action button live. Neither is a
 * refresh policy; the status code is.
 *
 * `gone` means the server answered "not to you": the row was deleted, or it is
 * a draft or a CO1 takedown the caller may no longer read. Retrying that will
 * fail forever, so callers drop what they hold and say so. Everything else —
 * offline, timeout, 500, a rate limit — is transient: keep the screen, offer a
 * retry.
 *
 * Mirrors lib/dispute-send-error.ts: classification lives beside the codes it
 * compares, once, rather than as an `instanceof` in each screen.
 */
import { ApiClientError } from '@/api/client'

/** The server's "you cannot read this" answer, whatever the reason behind it. */
const GONE_STATUS = 404

/**
 * Shown when the throw carried no usable message. Rendering an empty string
 * leaves the user with a titled error box and no explanation, which reads as a
 * broken screen rather than a failed request.
 */
const FALLBACK_MESSAGE = 'Something went wrong, please try again'

export interface DetailLoadError {
  /** Shown to the user; falls back to a generic line for a non-Error throw. */
  message: string
  /** The subject is unreadable for good — drop it rather than offering Retry. */
  gone: boolean
}

/**
 * `unknown` because that is the type of a catch binding, the one place TS
 * genuinely leaves no alternative — narrowed immediately below rather than cast.
 */
export function classifyDetailLoadError(error: unknown): DetailLoadError {
  // `gone` is decided first and only here — an envelope from the server is the
  // only thing that can prove the row is unreadable. The message falls back
  // independently, because a 404 with a blank body is still a 404.
  if (error instanceof ApiClientError) {
    return {
      message: error.message === '' ? FALLBACK_MESSAGE : error.message,
      gone: error.statusCode === GONE_STATUS,
    }
  }
  if (error instanceof Error && error.message !== '') {
    return { message: error.message, gone: false }
  }
  return { message: FALLBACK_MESSAGE, gone: false }
}
