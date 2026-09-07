/**
 * Form-level (not field-level) error line, one look everywhere.
 *
 * `role="alert"` because this appears in RESPONSE to something the reader just
 * did — a failed submit, a rejected code — and a message that only exists
 * visually leaves a screen-reader user with a form that silently did nothing.
 * It was a bare <p> until the auth port measured it; the Auth comp marks its
 * own error line the same way.
 *
 * `alert` and not `status`: this interrupts, because the action the reader
 * took did not happen. Field-level validation stays with its field, where
 * `TextField`'s own error is tied by proximity and label.
 */
export function FormError({ message }: { message: string | null }) {
  if (message === null || message === '') return null
  return (
    <p role="alert" className="text-sm text-feedback-danger-text">
      {message}
    </p>
  )
}
