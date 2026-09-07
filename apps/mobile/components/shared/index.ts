export { PersonCard } from './PersonCard'
export { ProofsGrid } from './ProofsGrid'
// MediaViewerModal pulls `expo-video` (native), and this barrel is imported
// broadly — re-exporting the component here would drag expo-video into every
// consumer (and every consumer's jest suite). Import it via its direct path
// `@/components/shared/media/MediaViewerModal`. The type below is erased at
// runtime, so it stays barrel-safe.
export type { MediaItem } from './media/types'
export { ReviewCard } from './ReviewCard'
export { ReviewsSection } from './ReviewsSection'
export { FeeSummary } from './FeeSummary'
export { DeadlineCountdown } from './DeadlineCountdown'
