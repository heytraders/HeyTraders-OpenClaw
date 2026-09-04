# OpenClaw Browser Adapter Architecture

Status: Agent-owned login is implemented and locally verified against OpenClaw `2026.8.2`; real venue credential verification remains pending.

## Problem

HeyTraders already owns a live, capability-driven command system. The OpenClaw integration must expose that system without duplicating commands or moving application policy into a provider-specific repository. A prompt-only skill cannot create the browser transport, so this repository owns one tool plugin and bundles a thin guidance skill with it.

## Runtime responsibilities

### HeyTraders frontend

- Registers and executes the live command catalog.
- Owns command schemas, readiness, identifiers, policy, idempotency, and presentation.
- Returns structured success, error, and user-action-required results.
- Hosts the exact `/agent` bootstrap surface and two private WebMCP tools for proof-of-possession login and public Wallet Vault intent preparation/status.

### HeyTraders backend

- Creates one ordinary `Users.id` and one self-owned `Agents` row for a new Agent public key.
- Owns single-use, origin-bound challenges and hashed, revocable browser sessions.
- Resolves the Agent browser cookie into the same canonical user principal used by accounts, billing, quota, strategies, and orders.
- Creates single-use Agent wallet intents bound to the Agent `user_id`, Agent identity, mainnet treasury address, and Wallet Vault public key.
- Verifies the Wallet Vault's completion signature before accepting the transient API signer.
- Validates and encrypts venue credentials through the existing account/broker path.

### Agent Wallet Vault

- Runs as a separate non-root container with no host port and no model-facing tool.
- Creates and persists one Agent-owned Hyperliquid mainnet treasury/master wallet.
- Keeps its AES root key and encrypted records in separate named volumes.
- Returns only public wallet state and the mainnet funding address to OpenClaw.
- Checks funding, rotates a fresh signer in one stable named Hyperliquid API-wallet slot with the official SDK, and sends that signer directly to the HeyTraders backend against a signed one-time intent.
- Erases the local API signer only after the backend confirms encrypted storage.
- When a later intent replaces the named signer, securely deletes ciphertext retained by any superseded failed delivery.
- Exposes no private-key export, transfer, withdrawal, or order operation.

### OpenClaw adapter

- Registers one optional `heytraders_cli` agent tool.
- Accepts only a selector command and structured argument object.
- Persists one Ed25519 identity in the OpenClaw state directory and proves possession without exposing the private key.
- Resolves the configured managed OpenClaw browser profile through the public `openclaw/plugin-sdk/browser-config` export.
- Rejects remote, extension-attached, `attachOnly`, non-loopback, wrong-origin, missing, and ambiguous targets.
- Invokes the page-defined authentication tool before every application command.
- Invokes the public page-defined `heytraders_cli` tool for normal commands.
- For exact Hyperliquid `exchange connect`, coordinates the fixed internal Wallet Vault with the private page-defined public-intent tool.
- Preserves structured responses without inventing application policy.

### Bundled skill

- Explains when and how to use the tool.
- Uses live `help` and `describe` discovery instead of copied command contracts.
- Requires state re-reading after mutations and genuine venue handoffs.
- Keeps credentials out of model-visible arguments and explains the public-address funding checkpoint.

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
9. For normal commands, invoke public `heytraders_cli`.
10. For exact Hyperliquid `exchange connect`, call the fixed internal Vault prepare operation. If the treasury is unfunded, return only its mainnet public funding address.
11. When funded, invoke the private page tool to create a one-time intent for the authenticated Agent, pass that public intent to the Vault, and let the Vault approve and deliver the API signer directly to the backend.
12. Read the browser-side intent status and return completion only when both Vault and HeyTraders report the same connected account.
13. For every page invocation, accept the named tool only when its registration `frameId` equals the canonical top-level frame, fail on navigation or detach, correlate the response, and enforce time and message-size limits.

There is no arbitrary JavaScript evaluation, direct bridge call, cookie or browser-storage extraction, environment credential binding, public Agent API-key bootstrap, or shell fallback. Wallet secret values never enter the Gateway, model request, browser tool input/output, DOM, or OpenClaw configuration.

## Required invariants

1. **One ingress:** every provider request reaches the same generic application command boundary.
2. **One command authority:** current runtime `help` and `describe` output outrank remembered or durable guidance.
3. **Exact origin and route:** only the configured approved origin's `/agent` surface is eligible.
4. **Stable identity:** one protected local Ed25519 key resumes one HeyTraders `user_id`; a new key creates a new user rather than guessing ownership.
5. **No model credential transport:** public tool parameters reject credential-like fields; Hyperliquid connect accepts only its canonical exchange selector.
6. **Vault-only custody:** the master key remains in the isolated Vault; a temporary API signer crosses only the direct signed Vault-to-backend request and is then erased locally.
7. **No policy duplication:** authorization, quota, credential validation/encryption, and application state remain owned by HeyTraders.
8. **Mainnet only:** testnet and arbitrary network overrides are rejected before wallet creation, intent preparation, or venue approval.
9. **Fail closed:** missing browser capability, unsupported profile, wrong or changing top-level origin, child-frame tool collision, multiple eligible tabs, unsafe CDP, auth failure, intent mismatch, timeout, or invalid Vault/WebMCP output returns a structured error without a legacy fallback.
10. **Bounded input and output:** commands, nesting, value count, response bodies, tab-list bodies, CDP messages, and execution time have explicit limits.
11. **Recoverable custody:** both the encrypted Vault data volume and its separate root-key volume require an access-controlled offline backup before the public treasury address is funded; neither is sufficient alone.
12. **Publication follows proof and approval:** local package and runtime proof do not authorize npm, ClawHub, or GitHub release publication.

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

### Agent-owned Hyperliquid wallet

The adapter intercepts only exact `exchange connect` with `exchange: "hyperliquid"`; it rejects extra selectors such as a network or credential reference. The Vault creates one persistent EVM treasury, but no venue action occurs while it is unfunded. The user transfers funds to the returned public mainnet address through a supported Hyperliquid flow and runs the same command again.

After funding, the page derives the canonical Agent `user_id` from its browser session and creates a short-lived intent containing only public identity fields. The Vault verifies those exact fields, rotates a fresh signer in one stable named Hyperliquid API-wallet slot, signs a completion message whose digest binds the signer without embedding it, and posts the signer directly to the backend. Reusing the name makes Hyperliquid replace the preceding signer instead of consuming another named-agent slot; the Vault then securely deletes any superseded failed-delivery ciphertext. The backend verifies the Vault signature and reuses the existing account connection boundary, which owns plan enforcement, exchange lookup, credential validation, encryption, rollback, and broker transition fencing. The Vault erases its temporary signer after confirmation. A storage response is not treated as venue readiness; the Agent must re-read credential and exchange status.

Other CEX and DEX connections stay under the live application catalog and visible browser workflow. This plugin no longer reads exchange secrets from environment variables and does not provide a generic credential-binding path.

### Supported version

The package is built against OpenClaw `2026.8.2`, requires Node.js `22.22.3` or newer, and declares a peer range of `>=2026.8.2 <2027`. Compatibility with later OpenClaw releases must be revalidated before widening that contract.

### Skill distribution

The skill currently ships only inside the plugin, so the guidance and required tool travel together. A separately installable ClawHub skill remains a future release decision; it must not imply that a prompt alone supplies the transport.

## Current proof boundary

The current exact packed artifact passed unit tests, TypeScript build, official plugin build/validation, archive inspection, Docker installation, runtime inspection, skill discovery, managed-browser startup, and an authenticated live `status` call on the Agent bootstrap page. After explicit server-side logout and Gateway/browser restart, the persisted key authenticated again to the same Agent and `user_id`; no second identity row was created. The new Wallet Vault path is verified with fake venue/backend adapters only until the operator-assisted mainnet checkpoint.

The following are intentionally not claimed:

- real Binance or Hyperliquid credential acceptance and broker readiness;
- order, strategy, or other financial mutation behavior;
- compatibility outside OpenClaw `2026.8.2`;
- npm, ClawHub, or GitHub release publication.
