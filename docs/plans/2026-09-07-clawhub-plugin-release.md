# ClawHub Plugin Release Implementation Plan

> Execute in the current checkout; no worktrees. User authorized ClawHub publication and requires verification in the in-app Browser afterward.

**Goal:** Publish the tested `@heytraders/openclaw-plugin` package under `@heytraders`, with bundled guidance and verifiable installation instructions.

**Architecture:** The package remains a single optional browser command adapter and Agent identity owner. Frontend/backend own the live catalogs, service policy, and authentication; this release introduces no infrastructure or wallet service. Publish the exact verified npm-pack artifact to ClawHub, then fetch it back and check it through an isolated installation without replacing the existing operator runtime.

**Tech Stack:** OpenClaw 2026.8.2, TypeScript ESM, Vitest, npm-pack, ClawHub CLI 0.23.3, Codex in-app Browser.

## Constraints

- Preserve the existing Agent identity, OAuth configuration, Telegram pairing, browser profile, and unrelated reports.
- Do not deploy Frontend/backend, make new exchange connections, sign wallet operations, trade, pay, or change repository visibility.
- Use the package's existing `0.1.0` version only if ClawHub confirms no prior release; never replace an immutable release.
- Keep all secrets, ignored state, internal reports, and development Compose files out of the published archive.
- No direct browser network/API or storage access; use the Browser skill for UI verification and official CLI for package operations.

## Task 1: Release metadata and operator guidance

Files: `README.md`, `skills/heytraders/SKILL.md`, existing manifests (only if validation requires a correction).

1. Inspect current package and publisher state, CLI authentication, and source provenance.
2. Add the precise ClawHub installation command, optional-tool allowance, and managed-browser prerequisite.
3. Keep the package manifest, display name, version, source commit, and installed code consistent. No runtime behavior changes.

## Task 2: Fresh artifact verification

1. Run `docker compose --profile dev run --rm --no-deps plugin-dev run verify` (tests, build, metadata check, OpenClaw validation).
2. Run `docker compose --profile dev run --rm --no-deps plugin-dev pack --silent`.
3. Inspect every packed filename and compare archive bytes to expected built/source files; reject secrets, symlinks, development files, or unexpected modules.
4. Run the current ClawHub package validator and exact publication dry run.
5. Obtain a bounded read-only release review, resolve any actionable blocker, and commit/push release source on develop.

## Task 3: Publish and verify

1. Publish only `@heytraders/openclaw-plugin@0.1.0` as owner `heytraders`, code-plugin family, with exact source metadata and release notes; wait for definitive publication/security results.
2. Inspect published version, scan/moderation state, and downloaded artifact digest.
3. Install that exact artifact into an isolated temporary OpenClaw state directory using the existing pinned image, without mounting operator credentials or browser data; validate installed metadata/tool registration.
4. Update the existing standalone `@heytraders/heytraders` skill with the bundled installation guidance after the plugin is publicly installable; preserve owner/title/categories/topics.
5. In the explicitly requested in-app Browser, confirm the publisher's plugin card, version, bundled skill, and install instructions. Leave the plugin page open as the deliverable.

## Acceptance and reporting

Report publication URL/version, scan state, downloaded-artifact verification, isolated install outcome, and Browser evidence. Distinguish public/installed from pending review. Never claim trading or fresh-account registration tests that were not run.
