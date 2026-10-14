import type { WsServerFrame } from '@tenda/shared'

/** Feature-facing port; transport implementations remain replaceable. */
export interface RealtimePublisher {
  publish(frame: WsServerFrame): void
}
