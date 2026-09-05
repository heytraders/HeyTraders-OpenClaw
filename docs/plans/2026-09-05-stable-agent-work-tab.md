# Stable Agent Work Tab Implementation Plan

**Goal:** Keep the authenticated OpenClaw work tab through navigation and distinguish the implemented tab fix from the proposed signup-observability work.

**Architecture:** The browser transport binds a target ID within one state-directory/browser-profile/origin scope and serializes operations on that scope. The Frontend exposes read-only Agent session status on every app route using the existing AuthService/session recovery owner and synchronizes the authStore projection only when it changes. Server session revalidation remains necessary because cookies are shared across tabs but authStore is page-local. Only a genuinely unauthenticated session enters the registered `/agent` route for the existing signing handshake; the same tab then returns to its previous registered route before dispatching the original command once.

**Tech Stack:** TypeScript/OpenClaw Plugin SDK, page WebMCP, existing JavaScript/Zustand Frontend authentication, Vitest for plugin-only tests.

## Task 1 — Pin the work tab and serialize browser operations

Files: `src/browser-transport.ts`, `src/browser-transport.test.ts`, and `src/agent-auth.ts` / `src/agent-auth.test.ts`.

1. Add a regression test where the first call navigates `/agent` to exchange settings and the second command must reuse the same target without creating a tab.
2. Add coverage for unrelated same-origin tabs, a missing/stale target, an off-origin bound target, concurrency, cancellation, changed Agent identity, and recovery before dispatch (never replay an already-dispatched command).
3. Run `docker compose --profile dev run --rm plugin-dev test` and observe the relevant failures.
4. Replace `/agent`-only selection with scoped target binding. When no binding exists, accept exactly one eligible same-origin page or create `/agent`; reject ambiguity and off-origin reuse.
5. Add an authentication-preparation hook used only after status proves the session unauthenticated. Navigate through canonical `nav` to `/agent`, sign there, and restore the exact prior registered route in the same tab before the requested operation.
6. Run the plugin tests again and inspect results.

## Task 2 — Separate status from the login surface

Files in `HeyTraders-Frontend`: `src/common/appBridge/agentAuthBridge.js`, `src/common/appBridge/webMcpBridge.js`, `src/common/navigation/appRouteCatalog.js`.

1. Register the private auth adapter on every app route; allow only `status` outside `/agent`.
2. Revalidate through `AuthService.getSession()` so cross-tab account changes are detected, using its existing refresh coordination. Synchronize public authStore identity/expiry only when changed; never read tokens or browser storage in the plugin. Do not let a failed session lookup or a logout race trigger registration.
3. Mark a human session separately and refuse to overwrite it. Keep Agent account identity checks in the transport before dispatch.
4. Register `/agent` as `auth.agent` in the canonical route catalog instead of adding an alternate navigation path.
5. Perform syntax/lint and static contract inspection only; no Jest, Vitest, application build, or frontend browser runtime.

## Task 3 — Guidance and artifact verification

Files: `README.md`, `docs/architecture.md`, `skills/heytraders/SKILL.md`.

1. Remove the instruction to remain on `/agent`; document target continuity, session recovery, and ambiguity handling.
2. Run OpenClaw `verify`, pack to a fresh temporary output directory, inspect the exact tarball, and check for secret/runtime files.
3. Review only scoped diffs and commit them on develop. Do not push or publish.

## Task 4 — Backend proposal only

Read: `HeyTraders/api_server/presentation/api/v1/routes/auth_bff.py`, shared IP/rate-limit owners, `agent_auth_repo.py`, and the Agent auth schema migration.

Deliver a design explaining cheap request rejection before storage/crypto, bounded one-time challenges and cleanup, exact atomic signup records with trusted source IPs, separate success/login/request counters, indexes/retention, and operational verification. Do not implement or run signup probes against the backend.
