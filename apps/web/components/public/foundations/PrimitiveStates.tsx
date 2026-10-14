'use client'

/**
 * Live primitives (comp lines 795-816) — hover, click and tab through them.
 *
 * The comp hand-rolls each control with inline styles, which makes this a
 * PICTURE of the design system. These are the shipped components instead, so
 * the page is the design system: a variant that regresses regresses here, and
 * a variant that is added and never wired up is visibly missing. That is the
 * only version of this page worth maintaining.
 *
 * A client component because the comp asks for live controls and `Chip` and
 * `Toggle` are stateful. /foundations is a team reference, so the bundle cost
 * is paid where it buys something — unlike the public feed, which stays free
 * of it.
 */
import { useState } from 'react'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import { Button, Chip, Eyebrow, Notice, Spinner, TextField, Toggle } from '@/components/ui'
import { FoundationsSection } from './FoundationsSection'

const BADGES: readonly BadgeVariant[] = [
  'success',
  'warning',
  'danger',
  'info',
  'brand',
  'accent',
  'neutral',
]

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border-subtle pb-6">
      {/* The shipped Eyebrow, not a hand-rolled copy of its classes — this
          page demonstrates the design system, so it must drift with it. */}
      <Eyebrow>{label}</Eyebrow>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

export function PrimitiveStates() {
  const [chip, setChip] = useState(true)
  const [toggle, setToggle] = useState(true)

  return (
    <FoundationsSection
      title="Primitive states"
      intro="The components this app ships, not copies of them. Hover, click and tab through — the disabled control in each row is the last one, and each is named for what it is, because a page demonstrating the design system should not ship two controls a screen reader cannot tell apart."
    >
      <div className="flex flex-col gap-6">
        <Row label="Button">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="danger">Destructive</Button>
          <Button variant="danger-outline">Danger outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" disabled>
            Disabled button
          </Button>
        </Row>

        <Row label="Text field">
          <TextField label="Default" placeholder="Lagos" />
          <TextField label="With an error" defaultValue="Lagoss" error="No such city in Nigeria." />
          <TextField label="Disabled field" placeholder="Unavailable" disabled />
        </Row>

        <Row label="Badge">
          {BADGES.map((variant) => (
            <Badge key={variant} variant={variant} label={variant} />
          ))}
        </Row>

        <Row label="Chip">
          <Chip label="Selected" selected={chip} onClick={() => setChip((on) => !on)} />
          <Chip label="Unselected" selected={!chip} onClick={() => setChip((on) => !on)} />
          <Chip label="Disabled chip" selected={false} disabled onClick={() => undefined} />
        </Row>

        <Row label="Toggle">
          <Toggle value={toggle} onChange={setToggle} label="Example toggle" />
          <Toggle value={false} onChange={() => undefined} label="Disabled toggle" disabled />
        </Row>

        <Row label="Feedback">
          <Notice tone="success" message="Escrow funded." />
          <Notice tone="error" message="That wallet is already linked to another account." />
          <Spinner />
        </Row>
      </div>
    </FoundationsSection>
  )
}
