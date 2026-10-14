import type { ReactNode } from 'react'
import { PHONE_CHROME } from './content'

interface Props {
  /** The screen, for assistive tech — the drawing itself is one image. */
  label: string
  /** Which bottom tab is lit. */
  activeTab: (typeof PHONE_CHROME.tabs)[number]
  children: ReactNode
}

/**
 * A phone, at the geometry the Paper Landing draws it: 218 × 468, a 34px
 * corner, a 6px frame in mobile's inverse surface, the status bar and the
 * four-tab bar. The screen between them is the child.
 */
export function PhoneFrame({ label, activeTab, children }: Props) {
  return (
    <div className="ph" role="img" aria-label={label}>
      <div className="sb">
        <span>{PHONE_CHROME.clock}</span>
        <span>{PHONE_CHROME.signal}</span>
      </div>
      {children}
      <div className="tabs">
        {PHONE_CHROME.tabs.map((tab) => (
          <span key={tab} className={tab === activeTab ? 'on' : undefined}>
            <i />
            {tab}
          </span>
        ))}
      </div>
    </div>
  )
}
