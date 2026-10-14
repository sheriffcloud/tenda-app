/**
 * Configures a demo address for the agent demo-session suite — a SIDE-EFFECT
 * module, so **import it first**.
 *
 * `getConfig()` memoises on its first read and the harness reads config while
 * building the app, so the variable has to be set before any import that
 * touches config. A plain assignment at the top of the suite would NOT do it:
 * imports are hoisted above statements, which is the same trap `oauth-env.ts`
 * exists for and documents.
 *
 * The unconfigured case cannot live in the same file for the same reason — once
 * config is loaded it is fixed for the process — so it has its own suite.
 */
/**
 * Deliberately EIP-55-shaped (mixed case), because that is what an operator
 * copies out of a block explorer. Storage must normalise it; every read folds
 * case anyway, so only an assertion on the stored row can catch a create that
 * skipped normalisation.
 */
export const DEMO_ADDRESS = '0xD0d0D0d0D0d0D0d0D0d0D0d0D0d0D0d0D0d0D0d0'

process.env.AGENT_DEMO_ADDRESS = DEMO_ADDRESS

/**
 * The draft ring's cap (#147), set LOW so a suite can fill it in a handful of
 * posts. Every demo suite shares it, since config is fixed per process; none
 * of them minted more than one draft per case before the ring existed.
 */
export const DEMO_DRAFT_CAP = 3
process.env.AGENT_DEMO_DRAFT_CAP = String(DEMO_DRAFT_CAP)
