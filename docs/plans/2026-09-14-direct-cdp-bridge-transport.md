# Direct CDP Bridge Transport Implementation Plan

> **For Claude:** Execute this plan in the current checkouts with test-first changes and bounded runtime verification. Project rules prohibit worktrees for this task.

**Goal:** Remove OpenClaw's WebMCP dependency by invoking the versioned HeyTraders page bridge directly over its managed browser CDP connection, then prove the path against the local Frontend at `http://localhost:5173` from the existing Docker OpenClaw runtime.

**Architecture:** The Frontend remains the sole owner of command execution and Agent authentication. Facade version 6 retains `window.__bridge.request`, adds one fixed `window.__bridge.agentAuth` operation, and keeps the existing WebMCP tools for Codex and other consumers. OpenClaw pins an exact allowed origin and top-level target, evaluates only a bundled constant program with a base64-encoded JSON payload, and dispatches through those two allowlisted facade members without exposing arbitrary JavaScript evaluation.

**Tech Stack:** TypeScript, Chrome DevTools Protocol, OpenClaw managed browser, JavaScript/Zustand Frontend authentication, Vitest, Node validation scripts, Docker Compose.

---

### Task 1: Specify the Frontend facade-v6 contract

**Files:**
- Modify: `../HeyTraders-Frontend/src/common/appBridge/agentAuthBridge.js`
- Modify: `../HeyTraders-Frontend/src/common/appBridge/heytradersBridge.js`
- Modify: `../HeyTraders-Frontend/scripts/validate-webmcp-cancellation-contract.mjs`
- Modify: `../HeyTraders-Frontend/scripts/validate-chart-container-command.mjs`

1. Add failing assertions that the facade has safe-integer version 6 and exactly `agentAuth`, `request`, and `version`.
2. Add a direct-auth assertion proving the facade returns the raw Agent-auth envelope while the existing WebMCP tool retains its one-text-content response.
3. Extract one raw Agent-auth request owner and reuse it from both transports.
4. Run only the relevant Node validation scripts; do not run Jest or a Frontend build.

### Task 2: Replace OpenClaw WebMCP with direct CDP facade invocation

**Files:**
- Modify: `src/browser-transport.ts`
- Modify: `src/browser-transport.test.ts`

1. Replace the fake WebMCP protocol tests with direct `Runtime.evaluate` response tests covering command/auth dispatch, version 5 rejection, missing methods, wrong origin, navigation races, cancellation, timeout, malformed results, and no replay after uncertain dispatch.
2. Implement one closed-union CDP invoker for `request` and `agentAuth`; encode data as JSON/base64 and never interpolate caller-controlled JavaScript.
3. Validate the top-level frame and origin before dispatch and repeat the origin/facade checks inside the evaluated program.
4. Keep work-tab binding, Agent identity checks, human-session conflict behavior, route restoration, serialization, and uncertain-outcome blocking unchanged.
5. Remove WebMCP protocol handling and obsolete error/tool names rather than retaining a fallback path.

### Task 3: Align package guidance with the implemented transport

**Files:**
- Modify: `src/index.ts`
- Modify: `openclaw.plugin.json`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/development.md`
- Modify: `docs/browser-transport-evidence.md`
- Modify: `skills/heytraders/SKILL.md`

1. Describe the versioned page facade and direct managed-browser CDP transport accurately.
2. Preserve the single model-facing `heytraders_cli` tool and live command discovery requirements.
3. State that arbitrary page scripts, browser storage, cookies, secrets, and direct HeyTraders HTTP calls remain unavailable.

### Task 4: Verify source and package behavior

1. Run the focused Frontend bridge validations.
2. Run OpenClaw tests, build, plugin check, and plugin validation in the pinned Docker development service.
3. Inspect the scoped diffs and ensure no WebMCP protocol call remains in OpenClaw runtime source.
4. Load the verification-before-completion skill before making completion claims.

### Task 5: Verify the real local Docker runtime

1. Confirm the host Frontend responds at `http://localhost:5173` and Docker is healthy.
2. Pack and force-install the exact local plugin artifact into the existing OpenClaw state without replacing its Agent identity, model, provider, Telegram configuration, or browser profile.
3. Configure only the ignored local application origin/proxy fields required for `http://localhost:5173`, validate configuration, and restart only the local Gateway if required.
4. Start/reuse the managed `openclaw` browser, close or navigate only task-owned/eligible local HeyTraders tabs as needed, and run a bounded real OpenClaw tool task.
5. Prove from the runtime receipt and Gateway logs that `status`, `help`, and `auth status` completed through `Runtime.evaluate` with no `WebMCP.*` protocol command.
6. Leave the local runtime in a coherent documented state and do not publish, push, deploy, connect an exchange, trade, or send a message.

### Task 6: Review and commit

1. Review both repository diffs, generated artifacts, status, and runtime evidence.
2. Commit the scoped Frontend change on `develop` and the scoped OpenClaw change on `main`; exclude pre-existing `reports/` and ignored runtime state.
3. Report package verification, local runtime verification, and any remaining limitations separately.
