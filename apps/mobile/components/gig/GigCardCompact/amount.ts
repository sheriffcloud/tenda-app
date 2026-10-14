/**
 * How a gig card renders its money.
 *
 * Its own module rather than `shared.ts`, which is a re-export barrel for
 * display constants and holds no logic of its own.
 */
import { formatAmountOrUnknown } from '@tenda/shared'

/**
 * The digits a gig card shows for its amount: two decimals at or above 1,
 * three below.
 *
 * Three below 1 because two would round a 0.005 SOL gig to "0.01" — a 100%
 * error on the number a worker decides by. All three variants had this
 * expression written out separately; one owner means they cannot drift.
 *
 * A null amount means this build has no metadata for the asset and so does not
 * know its decimals; `formatAmountOrUnknown` owns what is shown then.
 */
export function gigCardAmountDigits(amount: number | null): string {
  return formatAmountOrUnknown(amount, (value) => value.toFixed(value >= 1 ? 2 : 3))
}
