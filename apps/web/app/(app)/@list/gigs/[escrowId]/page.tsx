import { GigsListSlot } from '@/components/gigs'
// A slot matches the WHOLE path (CLAUDE.md): this entry answers the cold load
// of /gigs/<id>, which @list/gigs/page.tsx alone would leave without a column.
export default function GigListSlotPage() { return <GigsListSlot /> }
