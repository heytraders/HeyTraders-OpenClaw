# OpenClaw Browser Adapter Architecture

Status: implemented and locally verified against OpenClaw `2026.8.2` on 2026-09-02.

## Problem

HeyTraders already owns a live, capability-driven command system. The OpenClaw integration must expose that system without duplicating commands or moving application policy into a provider-specific repository. A prompt-only skill cannot create the browser transport, so this repository owns one tool plugin and bundles a thin guidance skill with it.

## Runtime responsibilities

### HeyTraders frontend

- Registers and executes the live command catalog.
- Owns command schemas, readiness, identifiers, policy, idempotency, and presentation.
- Returns structured success, error, and user-action-required results.

### OpenClaw adapter

- Registers one optional `heytraders_cli` agent tool.
- Accepts only a selector command and structured argument object.
- Resolves the configured managed OpenClaw browser profile through the public `openclaw/plugin-sdk/browser-config` export.
- Rejects remote, extension-attached, `attachOnly`, non-loopback, wrong-origin, missing, and ambiguous targets.
- Invokes only the page-defined `heytraders_cli` tool through the Chromium `WebMCP` CDP domain.
- Preserves structured responses without inventing application policy.

### Bundled skill

- Explains when and how to use the tool.
- Uses live `help` and `describe` discovery instead of copied command contracts.
- Requires state re-reading after mutations and user handoffs.
- Keeps credentials and visible confirmations with the user.

## Transport sequence

For every call, `src/browser-transport.ts` performs the following sequence:

1. Normalize and validate `{ command, args }`.
2. Resolve the named browser profile from the current OpenClaw configuration.
3. Require the managed `openclaw` driver with loopback HTTP CDP.
4. Read the bounded CDP `/json/list` target list.
5. Select exactly one page whose parsed origin equals `https://hey-traders.com`.
6. Validate that the selected WebSocket is the loopback `/devtools/page/<targetId>` endpoint returned for that exact target.
7. Enable CDP page lifecycle events and read `Page.getFrameTree` to revalidate the current top-level frame origin after connecting.
8. Enable WebMCP and accept `heytraders_cli` only when its registration `frameId` equals that canonical top-level frame.
9. Fail if the top-level frame navigates or detaches while the invocation is starting.
10. Send `WebMCP.invokeTool`, correlate the invocation result, enforce time and message-size limits, and return the structured output.

There is no arbitrary JavaScript evaluation, direct bridge call, credential extraction, browser-storage access, direct HeyTraders HTTP request, or shell fallback.

## Required invariants

1. **One ingress:** every provider request reaches the same generic application command boundary.
2. **One command authority:** current runtime `help` and `describe` output outrank remembered or durable guidance.
3. **Exact origin:** only `https://hey-traders.com` is eligible in this release.
4. **No credential transport:** tool parameters reject credential-like fields; the transport never reads cookies, tokens, or browser storage.
5. **No policy duplication:** confirmation, authorization, quotas, and application state remain owned by HeyTraders.
6. **Fail closed:** missing browser capability, unsupported profile, wrong or changing top-level origin, child-frame tool collision, multiple eligible tabs, unsafe CDP, timeout, or invalid WebMCP output returns a structured error without a legacy fallback.
7. **Bounded input and output:** commands, nesting, value count, tab-list bodies, CDP messages, and execution time have explicit limits.
8. **Publication follows proof and approval:** local package and runtime proof do not authorize npm, ClawHub, or GitHub release publication.

## Resolved design decisions

### Browser access contract

OpenClaw `2026.8.2` publicly exports browser configuration and profile resolution from `openclaw/plugin-sdk/browser-config`. The managed browser exposes a loopback CDP endpoint, and its Chromium protocol advertises the `Page` and `WebMCP` domains. The adapter uses page lifecycle/frame identity only to bind the WebMCP registration to the canonical top-level frame; it never evaluates page code.

### Tab selection and stability

The adapter does not persist a raw DevTools target across calls. It resolves the current profile and fresh tab list for each invocation, requires one eligible target, then rechecks the connected top-level frame and binds the tool registration to that frame ID. Navigation, child-frame collisions, or duplicate tabs therefore fail explicitly rather than silently retargeting a command.

### Optional tool exposure

The plugin declares `heytraders_cli` as optional. An operator must explicitly include it in OpenClaw tool policy, while HeyTraders remains responsible for command authorization and visible confirmations. The adapter never interprets tool discoverability as approval for a financial or irreversible action.

### Supported version

The package is built against OpenClaw `2026.8.2`, requires Node.js `22.22.3` or newer, and declares a peer range of `>=2026.8.2 <2027`. Compatibility with later OpenClaw releases must be revalidated before widening that contract.

### Skill distribution

The skill currently ships only inside the plugin, so the guidance and required tool travel together. A separately installable ClawHub skill remains a future release decision; it must not imply that a prompt alone supplies the transport.

## Current proof boundary

The exact packed artifact has passed unit tests, TypeScript build, official plugin build/validation, archive inspection, Docker installation, runtime inspection, skill discovery, managed-browser startup, and live read-only `help`, `status`, and `describe status` calls on the public HeyTraders landing page.

The following are intentionally not claimed:

- authenticated private-account behavior;
- mutation or visible-confirmation behavior;
- a model-provider-backed OpenClaw agent turn;
- compatibility outside OpenClaw `2026.8.2`;
- npm, ClawHub, or GitHub release publication.
