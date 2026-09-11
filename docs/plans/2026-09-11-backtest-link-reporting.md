# Backtest Link Reporting Implementation Plan

> **For Claude:** Execute this plan directly in the current checkouts. Do not create a worktree or delegate; preserve unrelated files.

**Goal:** Keep authenticated result navigation as neutral HeyTraders command data while making OpenClaw create and return a public share URL whenever it reports completed backtest performance to its operator.

**Architecture:** The Frontend catalog owns command schemas and result locations but no consumer-specific conversation policy for ordinary execution results. The OpenClaw bundled skill owns OpenClaw-specific reporting behavior: private workspace URLs remain available for Agent research, while `share-backtest-result` supplies the operator-facing URL. The adapter remains a transparent transport.

**Tech Stack:** React application command catalogs, JavaScript validation scripts, OpenClaw TypeScript plugin, Vitest, Docker Compose, ClawHub CLI.

---

### Task 1: Neutralize ordinary execution-result presentation guidance

**Files:**
- Modify: `../HeyTraders-Frontend/src/common/commands/gateways/catalogs/ExecutionCommandCatalog.js`
- Modify: `../HeyTraders-Frontend/scripts/validate-app-command-discovery.mjs`

1. Change the discovery validator to require ordinary execution commands to expose `navigation.result.href` without a `responseGuidance` instruction.
2. Run `npm run validate:app-command-discovery` and confirm the changed assertion fails against the old catalog.
3. Remove the shared `offer-result-navigation` guidance from ordinary backtest/live execution commands while retaining their navigation output schema and adding neutral authenticated-workspace field descriptions.
4. Run the command-discovery and backtest-sharing validators and confirm they pass.

### Task 2: Make OpenClaw result reporting use a share URL

**Files:**
- Modify: `skills/heytraders/SKILL.md`
- Modify: `src/package-release.test.ts`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `openclaw.plugin.json`
- Modify: `docker-compose.yml`
- Modify: `docs/development.md`

1. Add a failing release test that distinguishes the Agent's authenticated workspace URL from the operator-facing share URL and requires sharing before reporting completed performance.
2. Update the bundled skill so the workspace result URL is retained for the Agent's research, while completed performance reports call the live `share-backtest-result` command and send its returned URL intact.
3. Prepare the next immutable plugin patch version and align every public install/development artifact reference.
4. Run the full OpenClaw verification, package the release, inspect its members, and run ClawHub validation/dry-run.

### Task 3: Runtime verification in the local OpenClaw environment

**Files:**
- No product-source changes expected.

1. Start/reuse the repository's local OpenClaw Docker runtime without changing Agent identity, Telegram pairing, AI provider, or exchange configuration.
2. Install the exact locally packed plugin version into the existing runtime and restart through the normal Compose path.
3. Use an existing completed Agent-owned backtest to ask OpenClaw for a performance report.
4. Verify the Agent reads the private result for its work, invokes `share-backtest-result`, and responds with `/s/backtests/<id>#<secret>` rather than `/dashboard/workspace/chart`.
5. Revoke the QA share after validating the recipient view, unless retaining it is necessary for the user's requested deliverable.

### Task 4: Release and verify production artifacts

**Files:**
- No additional source files expected.

1. Commit scoped Frontend and OpenClaw changes on `develop` and push both repositories.
2. Release Frontend through the canonical `develop` to `main` PR, review the complete release diff, merge it, and verify the production command catalog no longer publishes ordinary result response guidance.
3. Publish the new `@heytraders/openclaw-plugin` patch release from the exact committed source and wait for definitive ClawHub checks.
4. Publish the next standalone `HeyTraders Quant Trading Skills` patch from the same committed skill source.
5. Download/verify the released plugin, install it in an isolated OpenClaw state, and verify the published plugin and standalone skill in the in-app Browser.

## Acceptance

- Ordinary HeyTraders execution commands retain the exact result navigation field but contain no instruction to present it to a user.
- The share command remains discoverable and returns the bearer share URL.
- OpenClaw performance reporting produces a working public share URL and does not send the authenticated workspace URL as the operator link.
- Frontend production catalog and both ClawHub artifacts match the committed sources and versions.
