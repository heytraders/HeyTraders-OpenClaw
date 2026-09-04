# OpenClaw Browser Adapter Architecture

Status: Agent-owned login is implemented and locally verified against OpenClaw `2026.8.2`; real venue credential verification remains pending.

## Problem

HeyTraders already owns a live, capability-driven command system. The OpenClaw integration must expose that system without duplicating commands or moving application policy into a provider-specific repository. A prompt-only skill cannot create the browser transport, so this repository owns one tool plugin and bundles a thin guidance skill with it.

## Runtime responsibilities

### HeyTraders frontend

- Registers and executes the live command catalog.
- Owns command schemas, readiness, identifiers, policy, idempotency, and presentation.
- Returns structured success, error, and user-action-required results.
- Hosts the exact `/agent` bootstrap surface and two private WebMCP tools for proof-of-possession login and trusted exchange credential delivery.

### HeyTraders backend

- Creates one ordinary `Users.id` and one self-owned `Agents` row for a new Agent public key.
- Owns single-use, origin-bound challenges and hashed, revocable browser sessions.
- Resolves the Agent browser cookie into the same canonical user principal used by accounts, billing, quota, strategies, and orders.
- Validates and encrypts venue credentials through the existing account/broker path.

### OpenClaw adapter

- Registers one optional `heytraders_cli` agent tool.
- Accepts only a selector command and structured argument object.
- Persists one Ed25519 identity in the OpenClaw state directory and proves possession without exposing the private key.
- Resolves the configured managed OpenClaw browser profile through the public `openclaw/plugin-sdk/browser-config` export.
- Rejects remote, extension-attached, `attachOnly`, non-loopback, wrong-origin, missing, and ambiguous targets.
- Invokes the page-defined authentication tool before every application command.
- Invokes the public page-defined `heytraders_cli` tool for normal commands.
- For exact `exchange connect`, resolves a configured safe reference to Gateway environment values and invokes only the private page-defined exchange tool.
- Preserves structured responses without inventing application policy.

### Bundled skill

- Explains when and how to use the tool.
- Uses live `help` and `describe` discovery instead of copied command contracts.
- Requires state re-reading after mutations and genuine venue handoffs.
- Keeps credentials out of model-visible arguments and documents safe binding references.

## Transport sequence

For every call, `src/browser-transport.ts` performs the following sequence:

1. Normalize and validate `{ command, args }`.
2. Resolve the named browser profile from the current OpenClaw configuration.
3. Require the managed `openclaw` driver with loopback HTTP CDP.
4. Read the bounded CDP `/json/list` target list.
5. Select exactly one `/agent` page at the configured exact origin, or create it through the loopback CDP target endpoint.
6. Validate that the selected WebSocket is the loopback `/devtools/page/<targetId>` endpoint returned for that exact target.
7. Enable CDP page lifecycle events and read `Page.getFrameTree` to revalidate the current top-level frame origin after connecting.
8. Invoke the private auth tool's `status`; when unauthenticated, request a challenge, validate the server's canonical bytes, sign them with the local private key, and complete the session.
9. For normal commands, invoke public `heytraders_cli`. For exact `exchange connect`, require only `exchange` plus optional `connectionRef`, resolve the binding from environment, and invoke the private exchange tool.
10. For every invocation, accept the named tool only when its registration `frameId` equals the canonical top-level frame, fail on navigation or detach, correlate the response, and enforce time and message-size limits.

There is no arbitrary JavaScript evaluation, direct bridge call, cookie or browser-storage extraction, public Agent API-key bootstrap, or shell fallback. Secret values enter only the private exchange invocation from the Gateway process environment and are not returned.

## Required invariants

1. **One ingress:** every provider request reaches the same generic application command boundary.
2. **One command authority:** current runtime `help` and `describe` output outrank remembered or durable guidance.
3. **Exact origin and route:** only the configured approved origin's `/agent` surface is eligible.
4. **Stable identity:** one protected local Ed25519 key resumes one HeyTraders `user_id`; a new key creates a new user rather than guessing ownership.
5. **No model credential transport:** public tool parameters reject credential-like fields; only safe binding references reach the model.
6. **Private credential path:** configured environment values are resolved only after Agent authentication and delivered only to the exact top-level `/agent` private tool.
7. **No policy duplication:** authorization, quota, credential validation/encryption, and application state remain owned by HeyTraders.
8. **Fail closed:** missing browser capability, unsupported profile, wrong or changing top-level origin, child-frame tool collision, multiple eligible tabs, unsafe CDP, auth failure, binding ambiguity, timeout, or invalid WebMCP output returns a structured error without a legacy fallback.
9. **Bounded input and output:** commands, nesting, value count, binding count, secret size, tab-list bodies, CDP messages, and execution time have explicit limits.
10. **Publication follows proof and approval:** local package and runtime proof do not authorize npm, ClawHub, or GitHub release publication.

## Resolved design decisions

### Browser access contract

OpenClaw `2026.8.2` publicly exports browser configuration and profile resolution from `openclaw/plugin-sdk/browser-config`. The managed browser exposes a loopback CDP endpoint, and its Chromium protocol advertises the `Page` and `WebMCP` domains. The adapter uses page lifecycle/frame identity only to bind the WebMCP registration to the canonical top-level frame; it never evaluates page code.

### Tab selection and stability

The adapter does not persist a raw DevTools target across calls. It resolves the current profile and fresh tab list for each invocation, requires one eligible target, then rechecks the connected top-level frame and binds the tool registration to that frame ID. Navigation, child-frame collisions, or duplicate tabs therefore fail explicitly rather than silently retargeting a command.

### Optional tool exposure

The plugin declares `heytraders_cli` as optional. An operator must explicitly include it in OpenClaw tool policy, while HeyTraders remains responsible for command authorization and visible confirmations. The adapter never interprets tool discoverability as approval for a financial or irreversible action.

### Agent-owned authentication

The Agent private key is generated atomically with owner-only file permissions under the OpenClaw state directory. HeyTraders stores only the 32-byte public key and its fingerprint. Challenges are single-use, short-lived, and bound to the exact application origin, client instance, display name, and public key. Access and refresh bearer values are returned as HttpOnly cookies while the database stores only SHA-256 digests. Logging out or rotating a refresh token revokes the previous session without changing the Agent's canonical `user_id`.

This path is independent of Google login, Link Agent codes, Codex OAuth, and the selected OpenClaw AI provider.

### CEX and DEX credential bindings

`credentialBindings` belongs to this plugin; it is not an OpenClaw standard. A binding stores a safe reference, exchange identifier, kind, optional account label, and environment-variable names. It never stores the values. CEX bindings require the fixed `apiKeyEnv` and `secretEnv` pair. DEX bindings map live venue field names to environment names so Hyperliquid and other signer-based venues retain their native credential contract.

The public command catalog continues to reject credentials. The adapter intercepts only exact `exchange connect`, resolves one unambiguous binding, and sends a normalized private request after login. The page then derives the canonical Agent `user_id` from its session and calls the existing account connection boundary, which owns plan enforcement, exchange lookup, credential validation, encryption, and broker transition fencing.

### Supported version

The package is built against OpenClaw `2026.8.2`, requires Node.js `22.22.3` or newer, and declares a peer range of `>=2026.8.2 <2027`. Compatibility with later OpenClaw releases must be revalidated before widening that contract.

### Skill distribution

The skill currently ships only inside the plugin, so the guidance and required tool travel together. A separately installable ClawHub skill remains a future release decision; it must not imply that a prompt alone supplies the transport.

## Current proof boundary

The exact packed artifact has passed unit tests, TypeScript build, official plugin build/validation, archive inspection, Docker installation, runtime inspection, skill discovery, managed-browser startup, and an authenticated live `status` call on the Agent bootstrap page. After explicit server-side logout and Gateway/browser restart, the persisted key authenticated again to the same Agent and `user_id`; no second identity row was created. Fake CEX and Hyperliquid-shaped DEX bindings pass contract tests without reaching a live venue.

The following are intentionally not claimed:

- real Binance or Hyperliquid credential acceptance and broker readiness;
- order, strategy, or other financial mutation behavior;
- compatibility outside OpenClaw `2026.8.2`;
- npm, ClawHub, or GitHub release publication.
