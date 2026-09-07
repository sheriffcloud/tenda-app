import type { ComponentType } from 'react'
import type { LandingSectionProps, SectionSurface } from '@/components/ui/SectionShell'
import { Hero } from './hero/Hero'
import { AppScreens } from './app-screens/AppScreens'
import { AgentFlow } from './agent-flow'
import { TaskWall } from './task-wall/TaskWall'
import { TwoProducts } from './two-products/TwoProducts'
import { EscrowExits } from './escrow-exits/EscrowExits'
import { Onboarding } from './onboarding/Onboarding'
import { Ecosystems } from './ecosystems/Ecosystems'
import { FAQ } from './faq/FAQ'
import { FinalCTA } from './final-cta/FinalCTA'

export interface LandingSectionEntry {
  /**
   * Stable identity: the React key, and the name a failing rhythm test prints.
   * Explicit rather than `Section.name`, which a production build mangles.
   */
  key: string
  Section: ComponentType<LandingSectionProps>
}

/**
 * The landing spine, in render order. This array IS the page — `LandingPage`
 * renders nothing but a map over it — so the order cannot drift from a copy of
 * itself, and inserting a section is one line here.
 *
 * Two placements are deliberate and should survive a reshuffle (both the
 * Paper Landing's order):
 *
 * The app screens sit DIRECTLY under the hero — the product itself, before
 * any argument about it — and the hire loop follows at once: it is the
 * clearest statement of what Tenda does, and it was the thing a visitor had to
 * scroll past nine screens to find.
 *
 * Ecosystems carries its own reference strip (chain id, gas token, wallet,
 * explorer) on each panel; the retired Networks section that once followed it
 * lives on there, beside the argument for each chain rather than after it.
 */
export const LANDING_SECTIONS: LandingSectionEntry[] = [
  { key: 'hero', Section: Hero },
  // §00: the product itself, before any argument about it (Paper Landing order).
  { key: 'app', Section: AppScreens },
  { key: 'hire-loop', Section: AgentFlow },
  { key: 'tasks', Section: TaskWall },
  { key: 'products', Section: TwoProducts },
  { key: 'exits', Section: EscrowExits },
  { key: 'onboarding', Section: Onboarding },
  { key: 'ecosystems', Section: Ecosystems },
  { key: 'faq', Section: FAQ },
  { key: 'download', Section: FinalCTA },
]

/**
 * The page rhythm: surfaces strictly alternate from the top, so the boundary
 * between any two sections is always visible.
 *
 * This is derived from POSITION on purpose (#55). Each section used to name its
 * own surface, which put a fact about the page inside ten components that
 * cannot see the page — and made an insertion expensive rather than free, since
 * inserting into an alternating chain flips everything below it. Adding
 * Networks cost two such flips; adding the hire loop at the top cost all eight
 * sections below it, eight files that changed in no other way.
 */
export function sectionSurface(index: number): SectionSurface {
  return index % 2 === 0 ? 'base' : 'alt'
}
