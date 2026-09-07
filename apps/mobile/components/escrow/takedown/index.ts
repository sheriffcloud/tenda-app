/**
 * Only the component is re-exported: `takedownCopy` / `takedownAudience` are
 * internals its tests reach directly, and re-exporting them here would publish
 * an API surface with no consumer.
 */
export { TakedownNotice } from './TakedownNotice'
