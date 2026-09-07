'use client'

/**
 * The offline screen (Auth comp, lines 657-676), and the one control on it.
 *
 * "Try again" is a reload rather than a router push: the reader is here
 * because the network failed, so the useful action is to re-attempt the
 * fetches the shell makes on boot, and a soft navigation to a route the app
 * already thinks it is on does nothing at all.
 *
 * A client component only for that button — the copy and the list are static,
 * and this page has to be readable from a cache with no data of its own.
 */
import { WifiOff, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui'
import { Eyebrow } from '@/components/ui'
import { StatusScreen } from './StatusScreen'
import { OFFLINE_COPY } from './copy'

export function OfflinePanel() {
  return (
    <StatusScreen
      icon={WifiOff}
      tone="warning"
      title={OFFLINE_COPY.title}
      body={OFFLINE_COPY.body}
      actions={
        <Button onClick={() => window.location.reload()}>
          <RotateCw size={16} aria-hidden />
          {OFFLINE_COPY.retry}
        </Button>
      }
    >
      <div className="mt-6 rounded-card border border-border-subtle bg-surface-inset p-[18px] text-left">
        <Eyebrow>{OFFLINE_COPY.availableTitle}</Eyebrow>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-5 text-content-secondary">
          {OFFLINE_COPY.available.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </StatusScreen>
  )
}
