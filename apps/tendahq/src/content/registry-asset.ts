/**
 * The one way landing content reads the shared asset registry.
 *
 * A bracket read of the registry object answers a truthy inherited FUNCTION for
 * a prototype key ('toString', 'constructor', '__proto__'), so a guard written
 * against it (`=== undefined`, `?.symbol`) never fires and the page prints
 * nonsense with nothing throwing. `getAssetMeta` is built on `Object.hasOwn`
 * and answers null for what the registry does not carry.
 *
 * Landing content is derived at MODULE LOAD from the chain manifest, so a miss
 * here is a manifest/registry disagreement, never user input. The right answer
 * is to fail the landing's build with a message that names the surface, rather
 * than ship a sentence that quietly omits a currency or a fee example computed
 * from nothing. (Skipping the asset would be the other choice, and it is the
 * worse one: it hides the disagreement behind copy that still reads fine.)
 */
import { getAssetMeta, type AssetMeta } from '@tenda/shared/constants/assets'

/** `where` names the surface, so the build error says which copy is affected. */
export function registryAsset(id: string, where: string): AssetMeta {
  const meta = getAssetMeta(id)
  if (meta === null) {
    throw new Error(`landing ${where}: asset '${id}' is not in the shared asset registry`)
  }
  return meta
}
