import Link from 'next/link'
import { winnerLabel, type ResolutionQueueRow } from '@tenda/shared'
import { Badge } from '@/components/ui/badge'
import { formatAdminDateTime } from '@/lib/date-format'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * The signing queue: proposals awaiting a key-holder. Each row links to the
 * dispute where the proposal (and its context dossier) can be reviewed and
 * signed / rejected.
 */
export function ResolutionQueueTable({ rows }: { rows: ResolutionQueueRow[] }) {
  if (rows.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">No proposals awaiting signature.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Subject</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Proposed outcome</TableHead>
          <TableHead>Proposed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <Link href={`/disputes/${r.dispute_id}`} className="underline-offset-2 hover:underline">
                {r.subject_title ?? 'Exchange dispute'}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="capitalize">{r.kind}</Badge>
            </TableCell>
            <TableCell>{winnerLabel(r.kind, r.proposed_winner)}</TableCell>
            <TableCell className="text-muted-foreground">
              {formatAdminDateTime(r.created_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
