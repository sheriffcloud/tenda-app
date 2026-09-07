import { APP_INFO } from '@tenda/shared'

/**
 * Web port of mobile's TermsNotice — same copy contract, links from the
 * shared APP_INFO (never inline). `verb` distinguishes "continuing"
 * (contact sign-in) from "connecting" (wallet).
 */
export function TermsNotice({ verb }: { verb: 'continuing' | 'connecting' }) {
  return (
    <p className="px-5 text-center text-xs leading-4 text-content-tertiary">
      By {verb} you agree to our{' '}
      <a href={APP_INFO.legal.terms} className="font-semibold text-content-secondary hover:underline">
        Terms
      </a>{' '}
      and{' '}
      <a href={APP_INFO.legal.privacy} className="font-semibold text-content-secondary hover:underline">
        Privacy
      </a>
      .
    </p>
  )
}
