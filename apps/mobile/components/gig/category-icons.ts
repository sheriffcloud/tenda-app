import { Bike, Camera, Laptop, ShoppingBag, Wrench } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { resolveCategoryIconMap, type GigCategory } from '@tenda/shared'

/**
 * The mobile resolution of shared CATEGORY_META icon NAMES to lucide
 * components.
 *
 * Only the REGISTRY is mobile's: the loop, the fail-at-module-load contract and
 * the error copy live in shared's `resolveCategoryIconMap` (#43), because this
 * file and web's twin held them character-identically apart from the lucide
 * package name. Building the map from the registry rather than hand-keying it
 * by category is what makes a renamed icon in shared fail HERE at module load
 * instead of drifting — which is exactly how the old Truck/Monitor vs
 * Bike/Laptop split survived: the names lived in dead metadata nobody resolved.
 */
const LUCIDE_BY_NAME: Record<string, LucideIcon> = {
  Bike,
  Camera,
  ShoppingBag,
  Wrench,
  Laptop,
}

export const CATEGORY_ICONS: Record<GigCategory, LucideIcon> =
  resolveCategoryIconMap(LUCIDE_BY_NAME)
