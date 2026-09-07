<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Tenda web engineering rules

- Correctness is the primary implementation constraint. Verify behavior end to end and do not guess or report unverified findings.
- Before implementation, critically assess the plan for bugs, gaps, edge cases, regressions, code drift, duplication, and maintainability.
- Keep every source and test file at or below 300 lines. Split responsibilities into cohesive, reusable components, hooks, utilities, and configuration.
- Prefer the simplest practical architecture that remains scalable and maintainable. Avoid over-engineering, code smells, and DRY violations.
- Do not add deprecated or obsolete dependencies.
- Do not use TypeScript `any`. Use `unknown` only at genuine untyped boundaries, narrow it immediately, and document why the boundary requires it.
- Do not scatter literals or environment-specific values. Put shared product copy, routes, limits, defaults, and configuration in typed single sources of truth; preserve legitimate dynamic domain data.
- Add meaningful positive and negative tests for changes and adjacent edge cases. Prove tests fail when the guarded behavior is broken; decorative tests are not acceptable.
- Maintain greater than 90% coverage for statements, branches, functions, and lines, and verify unit, integration, production-build, and browser E2E gates appropriate to the change.
- Keep Tenda's product positioning global. Do not describe the product as limited to Nigeria, Kenya, Ghana, West Africa, or another region. Region-specific market, payout, currency, and location data may remain only where it truthfully describes supported functionality or user data.
