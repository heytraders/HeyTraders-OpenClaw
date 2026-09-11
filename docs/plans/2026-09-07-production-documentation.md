# Production Documentation Implementation Plan

> Execute in the current checkout with a bounded read-only release reviewer. Do not create a worktree or a new user task.

**Goal:** Publish customer-only OpenClaw installation and usage documentation without Docker, development, build or internal deployment instructions on ClawHub.

**Architecture:** README and the bundled skill are public product guidance. Repository-only docs/development.md owns the optional local harness, packaging and contributor details and remains outside the package files allowlist. Runtime behavior is unchanged; only the exposed configuration description and version metadata change in code.

**Tech Stack:** OpenClaw 2026.8.2, TypeScript, Vitest, npm-pack, ClawHub CLI 0.23.3, in-app Browser.

## Task 1: Add a public documentation release gate

Create src/package-release.test.ts. Check public README/SKILL and configuration descriptions for developer-only setup instructions; check the package files allowlist and aligned version/install references. Run the new checks against current content and confirm the expected failures before editing documentation.

## Task 2: Separate documentation and prepare 0.1.1

- Rewrite README.md for prerequisites, installation, optional-tool permission, first Agent login, live command use, exchange onboarding and actionable recovery only.
- Move local Compose, token generation, build/pack, developer transport details and service deployment prerequisites into docs/development.md. Do not add this file to the package.
- Remove obsolete infrastructure/legacy-format commentary from skills/heytraders/SKILL.md while preserving live discovery, credential boundaries and handoffs.
- Change the public appOrigin description in src/index.ts and generated openclaw.plugin.json to describe its production default without internal hostnames.
- Align package.json, package-lock.json, openclaw.plugin.json and install references on 0.1.1; update the development Compose archive mount without recreating the operator Gateway.

## Task 3: Verify and publish

Run the complete verify script with the pinned plugin-dev image, pack the exact archive, compare all archive members with current build/source and assert only the fourteen intended files ship. Run ClawHub validation and a read-only release review. Commit/push the scoped changes on `main`, then dry-run and publish 0.1.1 using the exact committed source metadata. Preserve existing versions and catalog ownership.

## Task 4: Verify the actual distribution

Download the published archive and compare its bytes/digests; install it directly from ClawHub into a fresh isolated OpenClaw state with a writable temporary cache, enable the plugin and inspect real tool registration. Do not invoke an Agent login or exchange action. Keep the standalone skill's installation reference current without changing its visibility. In Browser, verify current version, README, Configuration and bundled skill contain no developer setup content. Record non-secret evidence and leave the product README open.
