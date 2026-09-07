'use client'

import Link from 'next/link'
import { displayName, type DisputeSummary } from '@tenda/shared'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ClaimActions } from './claim-actions'
import { AssigneeBadge } from './assignee-badge'
import { formatAdminDateTime } from '@/lib/date-format'

interface DisputeTableProps {
  disputes: DisputeSummary[]
  meId: string
  onChanged: () => void
}

function when(iso: string | null): string {
  return iso === null ? '—' : formatAdminDateTime(iso)
}

export function DisputeTable({ disputes, meId, onChanged }: DisputeTableProps) {
  if (disputes.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">No disputes here.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Subject</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Raised by</TableHead>
          <TableHead>Raised</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {disputes.map((d) => {
          const resolved = d.resolved_at !== null
          return (
            <TableRow key={d.dispute_id}>
              <TableCell>
                <Link href={`/disputes/${d.dispute_id}`} className="font-medium hover:underline">
                  {d.subject_title ?? 'Exchange offer'}
                </Link>
                <p className="max-w-md truncate text-xs text-muted-foreground">{d.reason}</p>
              </TableCell>
              <TableCell className="capitalize">{d.kind}</TableCell>
              <TableCell>
                {displayName(d.raised_by_first_name, d.raised_by_last_name, d.raised_by_id)}
              </TableCell>
              <TableCell>{when(d.raised_at)}</TableCell>
              <TableCell>
                <AssigneeBadge dispute={d} meId={meId} />
              </TableCell>
              <TableCell className="text-right">
                <ClaimActions
                  disputeId={d.dispute_id}
                  assignedToId={d.assigned_to_id}
                  resolved={resolved}
                  meId={meId}
                  onChanged={onChanged}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
