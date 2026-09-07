/**
 * The `Object.prototype` keys every shared VOCABULARY lookup must refuse.
 *
 * A plain object inherits from Object.prototype, so `SOME_MAP[key]` answers
 * something TRUTHY — a function — for each of these. That is not hypothetical:
 * an agent registered with `country: 'toString'` because `key in LOCATIONS` is
 * true for it, and every ASSET_META money helper printed 'NaN' for the same
 * reason (#33). Each vocabulary now has an accessor built on `Object.hasOwn`
 * (`getPayoutSpec`, `getAssetMeta`), and this is the list those accessors are
 * held to.
 *
 * ONE list, because it is the definition of the hazard: a suite that keeps its
 * own copy silently stops testing whatever a later edit adds here.
 */
export const INHERITED_OBJECT_KEYS = [
  '__proto__',
  'constructor',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
] as const
